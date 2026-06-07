import path from "node:path";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { createNoteBaseKnowledgeVersion } from "@/app/api/_lib/services/pinna-instance.service";
import { runLocalScreenshotOcrTasks } from "@/src/processing/localScreenshotOcr";
import {
  buildNoteKnowledge,
  extractSourceMetadataAndSummary,
  finalizeScreenshotInformation,
  getProcessingModel,
} from "@/src/processing/openaiProcessingClient";
import {
  ProcessingJobPayload,
  ProcessingJobRecord,
  processingJobPayloadSchema,
  processingLogPrefix,
} from "@/src/processing/processingTypes";

// This worker is a resumable four-step state machine stored in the note job payload so
// retries can continue chunk OCR/finalization work without spawning child processing jobs.
const maxScreenshotProcessingChunks = 40;

function asJsonValue(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function coerceAuthors(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );
}

function resolveStoredPath(filePath: string | null | undefined) {
  if (!filePath) {
    return null;
  }

  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);
}

function isSupportedImage(filePath: string | null) {
  if (!filePath) {
    return false;
  }

  const extension = path.extname(filePath).toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp"].includes(extension);
}

async function updateJobPayload(jobId: string, payload: ProcessingJobPayload) {
  await db.processingJobOutbox.update({
    where: { id: jobId },
    data: {
      payload: payload as Prisma.InputJsonValue,
      updatedAt: new Date(),
    },
  });
}

async function loadNoteContext(noteId: string) {
  return db.note.findUnique({
    where: { id: noteId },
    include: {
      source: true,
      capture: true,
      voiceAudio: true,
      voiceSession: {
        include: {
          audio: true,
          screenshotSession: {
            include: {
              chunks: {
                orderBy: { chunkIndex: "asc" },
              },
            },
          },
        },
      },
      project: true,
      session: true,
    },
  });
}

type LoadedNote = NonNullable<Awaited<ReturnType<typeof loadNoteContext>>>;
type ScreenshotChunk = NonNullable<
  NonNullable<LoadedNote["voiceSession"]>["screenshotSession"]
>["chunks"][number];

function toChunkSnapshot(chunk: ScreenshotChunk) {
  return {
    id: chunk.id,
    chunkIndex: chunk.chunkIndex,
    filePath: chunk.filePath,
    pageUrl: chunk.pageUrl,
    pageTitle: chunk.pageTitle,
  };
}

function buildRuntimeContext(note: LoadedNote, payload: ProcessingJobPayload) {
  const transcriptText =
    note.voiceAudio?.finalTranscript ||
    note.voiceSession?.audio?.finalTranscript ||
    null;
  const selectedText =
    note.capture?.selectedText ||
    note.voiceSession?.selectedText ||
    payload.selectedText ||
    note.noteText;
  const userCommentary = note.userCommentary || payload.userComment || null;
  const sourceUrl =
    note.source?.url ||
    note.voiceSession?.pageUrl ||
    note.capture?.originalUrl ||
    payload.sourceUrl ||
    null;
  const sourceTitle =
    note.source?.title ||
    note.voiceSession?.pageTitle ||
    note.capture?.title ||
    payload.pageTitle ||
    null;
  const screenshotSession = note.voiceSession?.screenshotSession || null;
  const orderedScreenshotChunks = (screenshotSession?.chunks || [])
    .slice()
    .sort((left, right) => left.chunkIndex - right.chunkIndex);

  const selectedScreenshotChunks =
    payload.selectedScreenshotChunkIds.length > 0
      ? orderedScreenshotChunks.filter((chunk) =>
          payload.selectedScreenshotChunkIds.includes(chunk.id),
        )
      : orderedScreenshotChunks.slice(0, maxScreenshotProcessingChunks);

  return {
    note,
    transcriptText,
    selectedText,
    userCommentary,
    sourceUrl,
    sourceTitle,
    screenshotSession,
    orderedScreenshotChunks,
    selectedScreenshotChunks,
    retrievalSnapshot: {
      noteId: note.id,
      sourceId: note.sourceId,
      captureId: note.captureId,
      voiceSessionId: note.voiceSessionId,
      voiceAudioId: note.voiceAudioId,
      screenshotSessionId: screenshotSession?.id || null,
      sourceUrl,
      sourceTitle,
      selectedText,
      userCommentary,
      transcriptText,
      orderedScreenshotChunks: orderedScreenshotChunks.map(toChunkSnapshot),
      selectedScreenshotChunks: selectedScreenshotChunks.map(toChunkSnapshot),
    },
  };
}

function buildPayloadForContext(input: {
  payload: ProcessingJobPayload;
  context: ReturnType<typeof buildRuntimeContext>;
  currentStep: ProcessingJobPayload["currentStep"];
  lastProcessedChunkIndex?: number | null;
}) {
  return processingJobPayloadSchema.parse({
    ...input.payload,
    sourceUrl: input.context.sourceUrl,
    pageTitle: input.context.sourceTitle,
    selectedText: input.context.selectedText,
    userComment: input.context.userCommentary,
    hasAudio: Boolean(input.context.note.voiceAudioId),
    hasScreenshots: Boolean(input.context.screenshotSession),
    screenshotId: input.context.screenshotSession?.id || null,
    audioId: input.context.note.voiceAudioId,
    captureIds: [
      input.context.note.captureId,
      input.context.screenshotSession?.captureId,
    ].filter((value): value is string => Boolean(value)),
    currentStep: input.currentStep,
    selectedScreenshotChunkIds: input.context.selectedScreenshotChunks.map(
      (chunk) => chunk.id,
    ),
    selectedScreenshotChunkCount: input.context.selectedScreenshotChunks.length,
    lastProcessedChunkIndex: input.lastProcessedChunkIndex ?? null,
    retrievalSnapshot: input.context.retrievalSnapshot,
  });
}

async function runRetrievalStep(
  job: ProcessingJobRecord,
  payload: ProcessingJobPayload,
  note: LoadedNote,
) {
  const context = buildRuntimeContext(note, payload);
  const nextPayload = buildPayloadForContext({
    payload,
    context,
    currentStep: "screenshot_ocr",
    lastProcessedChunkIndex:
      payload.currentStep === "screenshot_ocr"
        ? payload.lastProcessedChunkIndex
        : null,
  });

  await updateJobPayload(job.id, nextPayload);

  console.info(`${processingLogPrefix} note knowledge retrieval completed`, {
    jobId: job.id,
    noteId: note.id,
    screenshotSessionId: context.screenshotSession?.id || null,
    orderedChunkCount: context.orderedScreenshotChunks.length,
    selectedChunkCount: context.selectedScreenshotChunks.length,
  });

  return {
    payload: nextPayload,
    context,
  };
}

async function markChunkOcrFailed(chunkId: string, message: string) {
  await db.voiceScreenshotChunk.update({
    where: { id: chunkId },
    data: {
      ocrStatus: "failed",
      ocrError: message,
      updatedAt: new Date(),
    },
  });
}

function updateChunkProgress(
  payload: ProcessingJobPayload,
  chunkIndex: number,
) {
  return processingJobPayloadSchema.parse({
    ...payload,
    lastProcessedChunkIndex:
      payload.lastProcessedChunkIndex == null
        ? chunkIndex
        : Math.max(payload.lastProcessedChunkIndex, chunkIndex),
  });
}

async function runScreenshotOcrStep(
  job: ProcessingJobRecord,
  payload: ProcessingJobPayload,
  context: ReturnType<typeof buildRuntimeContext>,
) {
  if (
    !context.screenshotSession ||
    context.selectedScreenshotChunks.length === 0
  ) {
    const nextPayload = buildPayloadForContext({
      payload,
      context,
      currentStep: "screenshot_finalize_info",
      lastProcessedChunkIndex: payload.lastProcessedChunkIndex ?? null,
    });

    await updateJobPayload(job.id, nextPayload);
    return nextPayload;
  }

  let nextPayload = payload;
  const pendingChunks: Array<{
    id: string;
    chunkIndex: number;
    imagePath: string;
  }> = [];

  for (const chunk of context.selectedScreenshotChunks) {
    if (chunk.ocrStatus === "completed" || chunk.ocrStatus === "failed") {
      nextPayload = updateChunkProgress(nextPayload, chunk.chunkIndex);
      continue;
    }

    const imagePath = resolveStoredPath(chunk.filePath);

    if (!imagePath || !isSupportedImage(imagePath)) {
      await markChunkOcrFailed(
        chunk.id,
        "No supported screenshot chunk image was available for OCR.",
      );
      nextPayload = updateChunkProgress(nextPayload, chunk.chunkIndex);
      await updateJobPayload(job.id, nextPayload);
      continue;
    }

    try {
      await db.voiceScreenshotChunk.update({
        where: { id: chunk.id },
        data: {
          ocrStatus: "processing",
          ocrError: null,
          ocrStartedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      pendingChunks.push({
        id: chunk.id,
        chunkIndex: chunk.chunkIndex,
        imagePath,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Screenshot OCR failed.";
      await markChunkOcrFailed(chunk.id, message);

      console.error(`${processingLogPrefix} screenshot chunk OCR failed`, {
        jobId: job.id,
        noteId: context.note.id,
        chunkId: chunk.id,
        chunkIndex: chunk.chunkIndex,
        message,
      });
      nextPayload = updateChunkProgress(nextPayload, chunk.chunkIndex);
      await updateJobPayload(job.id, nextPayload);
    }
  }

  const chunkById = new Map(pendingChunks.map((chunk) => [chunk.id, chunk]));
  const settledOcrResults = await runLocalScreenshotOcrTasks(
    pendingChunks.map((chunk) => ({
      chunkId: chunk.id,
      imagePath: chunk.imagePath,
    })),
  );

  for (const settledResult of settledOcrResults) {
    const chunk = chunkById.get(settledResult.chunkId);

    if (!chunk) {
      continue;
    }

    if (settledResult.status === "fulfilled") {

      await db.voiceScreenshotChunk.update({
        where: { id: chunk.id },
        data: {
          extractedText: settledResult.extractedText,
          ocrStatus: "completed",
          ocrError: null,
          ocrModel: settledResult.model,
          ocrCompletedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      console.info(`${processingLogPrefix} screenshot chunk OCR completed`, {
        jobId: job.id,
        noteId: context.note.id,
        chunkId: chunk.id,
        chunkIndex: chunk.chunkIndex,
      });

      nextPayload = updateChunkProgress(nextPayload, chunk.chunkIndex);
      await updateJobPayload(job.id, nextPayload);
      continue;
    }

    const message = settledResult.error;

    await markChunkOcrFailed(chunk.id, message);

    console.error(`${processingLogPrefix} screenshot chunk OCR failed`, {
      jobId: job.id,
      noteId: context.note.id,
      chunkId: chunk.id,
      chunkIndex: chunk.chunkIndex,
      message,
    });

    nextPayload = updateChunkProgress(nextPayload, chunk.chunkIndex);
    await updateJobPayload(job.id, nextPayload);
  }

  nextPayload = buildPayloadForContext({
    payload: nextPayload,
    context,
    currentStep: "screenshot_finalize_info",
    lastProcessedChunkIndex: nextPayload.lastProcessedChunkIndex ?? null,
  });
  await updateJobPayload(job.id, nextPayload);

  return nextPayload;
}

async function runScreenshotFinalizationStep(
  job: ProcessingJobRecord,
  payload: ProcessingJobPayload,
  context: ReturnType<typeof buildRuntimeContext>,
) {
  if (!context.screenshotSession) {
    const nextPayload = buildPayloadForContext({
      payload,
      context,
      currentStep: "knowledge_upsert",
      lastProcessedChunkIndex: payload.lastProcessedChunkIndex ?? null,
    });

    await updateJobPayload(job.id, nextPayload);
    return nextPayload;
  }

  if (
    context.screenshotSession.finalizationStatus === "completed" &&
    (context.screenshotSession.finalizedSummary ||
      context.screenshotSession.importantContext)
  ) {
    const nextPayload = buildPayloadForContext({
      payload,
      context,
      currentStep: "knowledge_upsert",
      lastProcessedChunkIndex: payload.lastProcessedChunkIndex ?? null,
    });
    await updateJobPayload(job.id, nextPayload);
    return nextPayload;
  }

  const selectedChunkIds = new Set(
    context.selectedScreenshotChunks.map((chunk) => chunk.id),
  );
  const successfulChunks = context.screenshotSession.chunks
    .filter(
      (chunk) =>
        selectedChunkIds.has(chunk.id) &&
        chunk.ocrStatus === "completed" &&
        chunk.extractedText,
    )
    .sort((left, right) => left.chunkIndex - right.chunkIndex);

  if (successfulChunks.length === 0) {
    await db.voiceScreenshotSession.update({
      where: { id: context.screenshotSession.id },
      data: {
        finalizedSummary: null,
        importantContext: null,
        finalizationModel: null,
        finalizationStatus: "skipped",
        finalizationError:
          "No successful OCR chunk text was available for finalization.",
        finalizationStartedAt: new Date(),
        finalizedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const nextPayload = buildPayloadForContext({
      payload,
      context,
      currentStep: "knowledge_upsert",
      lastProcessedChunkIndex: payload.lastProcessedChunkIndex ?? null,
    });
    await updateJobPayload(job.id, nextPayload);
    return nextPayload;
  }

  await db.voiceScreenshotSession.update({
    where: { id: context.screenshotSession.id },
    data: {
      finalizationStatus: "processing",
      finalizationError: null,
      finalizationStartedAt: new Date(),
      updatedAt: new Date(),
    },
  });

  try {
    const finalized = await finalizeScreenshotInformation({
      pageTitle: context.screenshotSession.pageTitle || context.sourceTitle,
      pageUrl: context.screenshotSession.pageUrl || context.sourceUrl,
      selectedText: context.selectedText,
      mergedRawText: successfulChunks
        .map((chunk) => (chunk.extractedText || "").trim())
        .filter(Boolean)
        .join("\n\n"),
    });

    await db.voiceScreenshotSession.update({
      where: { id: context.screenshotSession.id },
      data: {
        finalizedSummary: finalized.finalizedSummary,
        importantContext: finalized.importantContext,
        finalizationModel: finalized.model,
        finalizationStatus: "completed",
        finalizationError: null,
        finalizedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    console.info(`${processingLogPrefix} screenshot finalization completed`, {
      jobId: job.id,
      noteId: context.note.id,
      screenshotSessionId: context.screenshotSession.id,
      successfulChunkCount: successfulChunks.length,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Screenshot finalization failed.";

    await db.voiceScreenshotSession.update({
      where: { id: context.screenshotSession.id },
      data: {
        finalizationStatus: "failed",
        finalizationError: message,
        updatedAt: new Date(),
      },
    });

    throw error;
  }

  const nextPayload = buildPayloadForContext({
    payload,
    context,
    currentStep: "knowledge_upsert",
    lastProcessedChunkIndex: payload.lastProcessedChunkIndex ?? null,
  });
  await updateJobPayload(job.id, nextPayload);

  return nextPayload;
}

export async function processNoteKnowledgeJob(job: ProcessingJobRecord) {
  console.info(`${processingLogPrefix} note knowledge worker started`, {
    jobId: job.id,
    noteId: job.noteId ?? null,
    sourceId: job.sourceId ?? null,
    voiceSessionId: job.voiceSessionId ?? null,
  });

  if (!job.noteId) {
    throw new Error("PROCESSING_JOB_NOTE_ID_MISSING");
  }

  const note = await loadNoteContext(job.noteId);

  if (!note) {
    throw new Error("PROCESSING_NOTE_NOT_FOUND");
  }

  console.info(
    `${processingLogPrefix} note knowledge worker loaded note context`,
    {
      jobId: job.id,
      noteId: note.id,
      sourceId: note.sourceId,
      captureId: note.captureId,
      voiceSessionId: note.voiceSessionId,
      voiceAudioId: note.voiceAudioId,
      hasSource: Boolean(note.source),
      hasCapture: Boolean(note.capture),
      hasVoiceSession: Boolean(note.voiceSession),
      hasTranscript: Boolean(
        note.voiceAudio?.finalTranscript ||
        note.voiceSession?.audio?.finalTranscript,
      ),
      hasScreenshotSession: Boolean(note.voiceSession?.screenshotSession),
    },
  );

  let payload = processingJobPayloadSchema.parse(job.payload ?? {});
  let context = buildRuntimeContext(note, payload);

  if (payload.currentStep === "retrieval" || !payload.retrievalSnapshot) {
    const retrieval = await runRetrievalStep(job, payload, note);
    payload = retrieval.payload;
    context = retrieval.context;
  }

  if (payload.currentStep === "screenshot_ocr") {
    payload = await runScreenshotOcrStep(job, payload, context);
    context = buildRuntimeContext(note, payload);
  }

  if (payload.currentStep === "screenshot_finalize_info") {
    const refreshedNote = await loadNoteContext(job.noteId);

    if (!refreshedNote) {
      throw new Error("PROCESSING_NOTE_NOT_FOUND");
    }

    context = buildRuntimeContext(refreshedNote, payload);
    payload = await runScreenshotFinalizationStep(job, payload, context);
    context = buildRuntimeContext(refreshedNote, payload);
  }

  const finalNote = await loadNoteContext(job.noteId);

  if (!finalNote) {
    throw new Error("PROCESSING_NOTE_NOT_FOUND");
  }

  context = buildRuntimeContext(finalNote, payload);

  const screenshotImportantText = [
    context.screenshotSession?.finalizedSummary || null,
    context.screenshotSession?.importantContext || null,
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join("\n\n");
  const existingAuthors = coerceAuthors(finalNote.source?.authors);
  const existingPublicationDate =
    finalNote.source?.publicationDate?.toISOString().slice(0, 10) || null;

  console.info(
    `${processingLogPrefix} note knowledge worker assembled inputs`,
    {
      jobId: job.id,
      noteId: finalNote.id,
      sourceUrl: context.sourceUrl,
      sourceTitle: context.sourceTitle,
      selectedTextLength: context.selectedText?.length ?? 0,
      userCommentLength: context.userCommentary?.length ?? 0,
      transcriptLength: context.transcriptText?.length ?? 0,
      screenshotImportantLength: screenshotImportantText.length,
      existingAuthorsCount: existingAuthors.length,
    },
  );

  const metadataSummary = await extractSourceMetadataAndSummary({
    noteText: finalNote.noteText,
    selectedText: context.selectedText,
    userComment: context.userCommentary,
    screenshotImportantText,
    transcriptText: context.transcriptText,
    sourceTitle: context.sourceTitle,
    sourceUrl: context.sourceUrl,
    existingAuthors,
    existingAbstract: finalNote.source?.abstract || null,
    existingPublicationDate,
  });

  const knowledge = await buildNoteKnowledge({
    noteText: finalNote.noteText,
    selectedText: context.selectedText,
    userComment: context.userCommentary,
    screenshotImportantText,
    transcriptText: context.transcriptText,
    sourceSummary: metadataSummary.summary,
    sourceTitle: metadataSummary.title || context.sourceTitle,
    sourceUrl: context.sourceUrl,
    sourceAbstract:
      metadataSummary.abstract || finalNote.source?.abstract || null,
    authors:
      metadataSummary.authors.length > 0
        ? metadataSummary.authors
        : existingAuthors,
    publicationDate: metadataSummary.publicationDate || existingPublicationDate,
  });

  const sourceSnapshot = asJsonValue({
    sourceUrl: context.sourceUrl,
    sourceTitle: context.sourceTitle,
    selectedText: context.selectedText,
    transcriptText: context.transcriptText,
    screenshotInfo: context.screenshotSession
      ? {
          finalizedSummary: context.screenshotSession.finalizedSummary,
          importantContext: context.screenshotSession.importantContext,
          finalizationStatus: context.screenshotSession.finalizationStatus,
          finalizationError: context.screenshotSession.finalizationError,
        }
      : null,
    existingSourceMetadata: finalNote.source
      ? {
          title: finalNote.source.title,
          authors: existingAuthors,
          abstract: finalNote.source.abstract,
          publicationDate: existingPublicationDate,
          metadata: finalNote.source.metadata,
        }
      : null,
  });

  const baseKnowledgeVersion = await createNoteBaseKnowledgeVersion({
    noteId: finalNote.id,
    sourceId: finalNote.sourceId,
    projectId: finalNote.projectId,
    sessionId: finalNote.sessionId,
    title: metadataSummary.title || context.sourceTitle,
    authors:
      metadataSummary.authors.length > 0
        ? metadataSummary.authors
        : existingAuthors,
    publicationDate: metadataSummary.publicationDate || existingPublicationDate,
    abstract: metadataSummary.abstract || finalNote.source?.abstract || null,
    summary: metadataSummary.summary,
    keyFindings: knowledge.keyFindings,
    userView: knowledge.userView,
    conclusion: knowledge.conclusion,
    model: knowledge.model || metadataSummary.model || getProcessingModel(),
    sourceSnapshot,
  });

  const noteKnowledge = await db.noteKnowledge.upsert({
    where: { noteId: finalNote.id },
    update: {
      sourceId: finalNote.sourceId,
      projectId: finalNote.projectId,
      sessionId: finalNote.sessionId,
      title: metadataSummary.title || context.sourceTitle,
      authors: asJsonValue(
        metadataSummary.authors.length > 0
          ? metadataSummary.authors
          : existingAuthors,
      ),
      publicationDate:
        metadataSummary.publicationDate || existingPublicationDate,
      abstract: metadataSummary.abstract || finalNote.source?.abstract || null,
      summary: metadataSummary.summary,
      keyFindings: knowledge.keyFindings,
      userView: knowledge.userView,
      conclusion: knowledge.conclusion,
      model: knowledge.model || metadataSummary.model || getProcessingModel(),
      sourceSnapshot,
      updatedAt: new Date(),
    },
    create: {
      noteId: finalNote.id,
      sourceId: finalNote.sourceId,
      projectId: finalNote.projectId,
      sessionId: finalNote.sessionId,
      title: metadataSummary.title || context.sourceTitle,
      authors: asJsonValue(
        metadataSummary.authors.length > 0
          ? metadataSummary.authors
          : existingAuthors,
      ),
      publicationDate:
        metadataSummary.publicationDate || existingPublicationDate,
      abstract: metadataSummary.abstract || finalNote.source?.abstract || null,
      summary: metadataSummary.summary,
      keyFindings: knowledge.keyFindings,
      userView: knowledge.userView,
      conclusion: knowledge.conclusion,
      model: knowledge.model || metadataSummary.model || getProcessingModel(),
      sourceSnapshot,
    },
  });

  await db.note.update({
    where: { id: finalNote.id },
    data: {
      noteKnowledgeId: noteKnowledge.id,
      updatedAt: new Date(),
    },
  });

  await updateJobPayload(
    job.id,
    buildPayloadForContext({
      payload,
      context,
      currentStep: "knowledge_upsert",
      lastProcessedChunkIndex: payload.lastProcessedChunkIndex ?? null,
    }),
  );

  console.info(`${processingLogPrefix} note knowledge worker completed`, {
    jobId: job.id,
    noteId: finalNote.id,
    noteKnowledgeId: noteKnowledge.id,
    baseKnowledgeVersionId: baseKnowledgeVersion.id,
  });

  return baseKnowledgeVersion;
}
