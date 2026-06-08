import path from "node:path";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { createNoteBaseKnowledgeVersion } from "@/app/api/_lib/services/pinna-instance.service";
import { runLocalScreenshotOcrTasks } from "@/src/processing/localScreenshotOcr";
import {
  buildGroundedSourceSummary,
  buildNoteKnowledge,
  extractClickyScreenshotDetailsFromImages,
  extractStructuredSourceFieldsFromText,
  getProcessingModel,
} from "@/src/processing/openaiProcessingClient";
import {
  ClickyScreenshotExtraction,
  DeferredProcessingError,
  ProcessingJobPayload,
  ProcessingJobRecord,
  processingJobPayloadSchema,
  processingLogPrefix,
} from "@/src/processing/processingTypes";

// This worker is a resumable four-step state machine stored in the note job payload so
// retries can continue chunk OCR/finalization work without spawning child processing jobs.
const maxScreenshotProcessingChunks = 40;
const clickyPlaceholder = "N/A";
const clickyRetryDelayMs = 5 * 60 * 1000;
const placeholderTitles = new Set([
  "research capture",
  "research screenshot",
  "unknown",
  "none",
]);

function isPlaceholderValue(value: string | null | undefined) {
  return value?.trim() === clickyPlaceholder;
}

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

function cleanText(value: string | null | undefined) {
  return value?.trim() || null;
}

function cleanMeaningfulText(value: string | null | undefined) {
  const trimmed = cleanText(value);
  if (!trimmed || isPlaceholderValue(trimmed)) {
    return null;
  }

  return trimmed;
}

function cleanMeaningfulTitle(value: string | null | undefined) {
  const trimmed = cleanText(value);
  if (!trimmed || isPlaceholderValue(trimmed)) {
    return null;
  }

  return placeholderTitles.has(trimmed.toLowerCase()) ? null : trimmed;
}

function isSupportedImage(filePath: string | null) {
  if (!filePath) {
    return false;
  }

  const extension = path.extname(filePath).toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp"].includes(extension);
}

function isDirectScreenshotCapture(note: LoadedNote) {
  return note.capture?.artifactType === "screenshot";
}

function deriveCaptureOrigin(note: LoadedNote, payload: ProcessingJobPayload) {
  if (payload.captureOrigin?.trim()) {
    return payload.captureOrigin.trim();
  }

  const captureOrigin = note.capture?.sourceLabel?.trim();
  if (captureOrigin) {
    return captureOrigin;
  }

  const sourceMetadata =
    note.source?.metadata &&
    typeof note.source.metadata === "object" &&
    !Array.isArray(note.source.metadata)
      ? (note.source.metadata as Record<string, unknown>)
      : null;
  const researchIngest =
    sourceMetadata?.researchIngest &&
    typeof sourceMetadata.researchIngest === "object" &&
    !Array.isArray(sourceMetadata.researchIngest)
      ? (sourceMetadata.researchIngest as Record<string, unknown>)
      : null;

  return typeof researchIngest?.captureOrigin === "string"
    ? researchIngest.captureOrigin
    : null;
}

function directScreenshotPath(note: LoadedNote) {
  if (!isDirectScreenshotCapture(note)) {
    return null;
  }

  return resolveStoredPath(
    note.capture?.storagePath || note.capture?.imagePath || null,
  );
}

function selectedScreenshotImagePaths(
  context: ReturnType<typeof buildRuntimeContext>,
) {
  if (context.directCaptureImagePath) {
    return [context.directCaptureImagePath].filter(Boolean);
  }

  return context.selectedScreenshotChunks
    .map((chunk) => resolveStoredPath(chunk.filePath))
    .filter((value): value is string => Boolean(value && isSupportedImage(value)));
}

async function applyClickyExtractionToRecords(input: {
  note: LoadedNote;
  selectedText?: string | null;
  title?: string | null;
  url?: string | null;
  authors?: string[];
  abstract?: string | null;
  publicationDate?: string | null;
}) {
  if (
    input.note.captureId &&
    !cleanText(input.note.capture?.selectedText) &&
    cleanMeaningfulText(input.selectedText)
  ) {
    await db.capture.update({
      where: { id: input.note.captureId },
      data: {
        selectedText: cleanMeaningfulText(input.selectedText),
      },
    });
  }

  if (
    (!cleanMeaningfulText(input.note.selectedText) ||
      input.note.selectedText.trim() === "N/A") &&
    cleanMeaningfulText(input.selectedText)
  ) {
    await db.note.update({
      where: { id: input.note.id },
      data: {
        selectedText: cleanMeaningfulText(input.selectedText) || "N/A",
        updatedAt: new Date(),
      },
    });
  }

  if (!input.note.sourceId) {
    return;
  }

  const nextAuthors =
    coerceAuthors(input.note.source?.authors).length > 0
      ? undefined
      : input.authors && input.authors.length > 0
        ? asJsonValue(input.authors)
        : undefined;

  await db.source.update({
    where: { id: input.note.sourceId },
    data: {
      title:
        cleanMeaningfulTitle(input.title) ||
        cleanMeaningfulTitle(input.note.source?.title) ||
        undefined,
      url:
        cleanText(input.note.source?.url) ||
        cleanMeaningfulText(input.url) ||
        undefined,
      authors: nextAuthors,
      abstract:
        cleanText(input.note.source?.abstract) ||
        cleanMeaningfulText(input.abstract) ||
        undefined,
      publicationDate:
        input.note.source?.publicationDate ||
        !cleanMeaningfulText(input.publicationDate)
          ? undefined
          : new Date(cleanMeaningfulText(input.publicationDate)!),
    },
  });
}

function normalizeClickyStringField(
  value: string | null | undefined,
  fallback = clickyPlaceholder,
) {
  const trimmed = value?.trim() || "";
  return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeClickyNullableField(value: string | null | undefined) {
  const trimmed = value?.trim() || "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeClickyAuthors(authors: string[] | null | undefined) {
  return Array.isArray(authors)
    ? authors
        .map((author) => author.trim())
        .filter((author) => author.length > 0 && !isPlaceholderValue(author))
    : [];
}

function normalizeClickyExtraction(
  extraction: ClickyScreenshotExtraction,
): ClickyScreenshotExtraction {
  return {
    extractedText: normalizeClickyStringField(extraction.extractedText),
    selectedText: normalizeClickyStringField(extraction.selectedText),
    title: normalizeClickyStringField(extraction.title),
    url: normalizeClickyNullableField(extraction.url),
    authors: normalizeClickyAuthors(extraction.authors),
    abstract: normalizeClickyStringField(extraction.abstract),
    publicationDate: normalizeClickyNullableField(extraction.publicationDate),
    model: extraction.model.trim() || getProcessingModel(),
  };
}

function emptyClickyExtractionFallback(): ClickyScreenshotExtraction {
  return normalizeClickyExtraction({
    extractedText: "",
    selectedText: null,
    title: null,
    url: null,
    authors: [],
    abstract: null,
    publicationDate: null,
    model: getProcessingModel(),
  });
}

function clickyExtractionNeedsRetry(extraction: ClickyScreenshotExtraction) {
  return (
    isPlaceholderValue(extraction.title) &&
    !cleanMeaningfulText(extraction.url) &&
    extraction.authors.length === 0 &&
    !cleanMeaningfulText(extraction.abstract) &&
    !cleanMeaningfulText(extraction.selectedText) &&
    !cleanMeaningfulText(extraction.extractedText)
  );
}

function nextClickyRetryTime() {
  return new Date(Date.now() + clickyRetryDelayMs);
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
    note.userCommentary ||
    payload.userComment ||
    null;
  const selectedText =
    note.capture?.selectedText ||
    note.voiceSession?.selectedText ||
    payload.selectedText ||
    null;
  const userCommentary = note.userCommentary || payload.userComment || null;
  const sourceUrl =
    note.source?.url ||
    note.voiceSession?.pageUrl ||
    note.capture?.originalUrl ||
    payload.sourceUrl ||
    null;
  const sourceTitle =
    cleanMeaningfulTitle(note.source?.title) ||
    cleanMeaningfulTitle(note.voiceSession?.pageTitle) ||
    cleanMeaningfulTitle(note.capture?.title) ||
    cleanMeaningfulTitle(payload.pageTitle) ||
    null;
  const screenshotSession = note.voiceSession?.screenshotSession || null;
  const captureOrigin = deriveCaptureOrigin(note, payload);
  const directCaptureImagePath = directScreenshotPath(note);
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
    captureOrigin,
    directCaptureImagePath,
    directScreenshotText: payload.directScreenshotText || null,
    directScreenshotOcrModel: payload.directScreenshotOcrModel || null,
    directScreenshotSummary: payload.directScreenshotSummary || null,
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
    captureOrigin: input.context.captureOrigin,
    hasAudio: Boolean(input.context.note.voiceAudioId),
    hasScreenshots: Boolean(
      input.context.screenshotSession || input.context.directCaptureImagePath,
    ),
    screenshotId: input.context.screenshotSession?.id || null,
    audioId: input.context.note.voiceAudioId,
    captureIds: [
      input.context.note.captureId,
      input.context.screenshotSession?.captureId,
    ].filter((value): value is string => Boolean(value)),
    directScreenshotText: input.context.directScreenshotText,
    directScreenshotOcrModel: input.context.directScreenshotOcrModel,
    directScreenshotSummary: input.context.directScreenshotSummary,
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
  if (context.captureOrigin === "clicky") {
    const nextPayload = buildPayloadForContext({
      payload,
      context,
      currentStep: "screenshot_finalize_info",
      lastProcessedChunkIndex: payload.lastProcessedChunkIndex ?? null,
    });

    await updateJobPayload(job.id, nextPayload);
    return nextPayload;
  }

  if (!context.screenshotSession && !context.directCaptureImagePath) {
    const nextPayload = buildPayloadForContext({
      payload,
      context,
      currentStep: "screenshot_finalize_info",
      lastProcessedChunkIndex: payload.lastProcessedChunkIndex ?? null,
    });

    await updateJobPayload(job.id, nextPayload);
    return nextPayload;
  }

  if (context.directCaptureImagePath && !context.screenshotSession) {
    if (payload.directScreenshotText) {
      const nextPayload = buildPayloadForContext({
        payload,
        context,
        currentStep: "screenshot_finalize_info",
        lastProcessedChunkIndex: payload.lastProcessedChunkIndex ?? 0,
      });

      await updateJobPayload(job.id, nextPayload);
      return nextPayload;
    }

    const [result] = await runLocalScreenshotOcrTasks([
      {
        chunkId: context.note.captureId || context.note.id,
        imagePath: context.directCaptureImagePath,
      },
    ]);

    if (!result || result.status !== "fulfilled") {
      throw new Error(result?.error || "Screenshot OCR failed.");
    }

    const nextPayload = processingJobPayloadSchema.parse({
      ...buildPayloadForContext({
        payload,
        context: {
          ...context,
          directScreenshotText: result.extractedText,
          directScreenshotOcrModel: result.model,
        },
        currentStep: "screenshot_finalize_info",
        lastProcessedChunkIndex: 0,
      }),
      directScreenshotText: result.extractedText,
      directScreenshotOcrModel: result.model,
    });

    await updateJobPayload(job.id, nextPayload);
    return nextPayload;
  }

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
  if (context.captureOrigin === "clicky") {
    const imagePaths = selectedScreenshotImagePaths(context);
    let extraction = emptyClickyExtractionFallback();

    if (imagePaths.length > 0) {
      try {
        extraction = normalizeClickyExtraction(
          await extractClickyScreenshotDetailsFromImages({
            pageTitle: context.sourceTitle,
            pageUrl: context.sourceUrl,
            selectedText: context.selectedText,
            imagePaths,
          }),
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Screenshot metadata extraction failed.";

        if (job.attempts < job.maxAttempts) {
          throw new DeferredProcessingError(
            `CLICKY_EXTRACTION_RETRY:${message}`,
            nextClickyRetryTime(),
            true,
          );
        }

        console.warn(
          `${processingLogPrefix} screenshot metadata extraction exhausted retries`,
          {
            jobId: job.id,
            noteId: context.note.id,
            attempts: job.attempts,
            maxAttempts: job.maxAttempts,
            message,
          },
        );
      }
    }

    if (
      clickyExtractionNeedsRetry(extraction) &&
      job.attempts < job.maxAttempts
    ) {
      throw new DeferredProcessingError(
        "CLICKY_EXTRACTION_RETRY:missing_core_fields",
        nextClickyRetryTime(),
        true,
      );
    }

    await applyClickyExtractionToRecords({
      note: context.note,
      selectedText: extraction.selectedText,
      title: extraction.title,
      url: extraction.url,
      authors: extraction.authors,
      abstract: extraction.abstract,
      publicationDate: extraction.publicationDate,
    });

    const missingStructuredFields = [
      cleanMeaningfulTitle(extraction.title) ? null : "title",
      cleanMeaningfulText(extraction.url) ? null : "url",
      extraction.authors.length > 0 ? null : "authors",
      cleanMeaningfulText(extraction.abstract) ? null : "abstract",
      cleanMeaningfulText(extraction.selectedText) ? null : "selectedText",
      cleanMeaningfulText(extraction.publicationDate) ? null : "publicationDate",
    ].filter((value): value is string => Boolean(value));

    console.info(
      `${processingLogPrefix} structured source field extraction completed`,
      {
        jobId: job.id,
        noteId: context.note.id,
        captureOrigin: context.captureOrigin,
        usedOcrText: false,
        usedImages: imagePaths.length > 0,
        missingStructuredFields,
      },
    );

    const nextPayload = processingJobPayloadSchema.parse({
      ...buildPayloadForContext({
        payload,
        context: {
          ...context,
          directScreenshotText:
            !context.screenshotSession &&
            cleanMeaningfulText(extraction.extractedText)
              ? cleanMeaningfulText(extraction.extractedText)
              : context.directScreenshotText,
          directScreenshotOcrModel:
            !context.screenshotSession && extraction.model
              ? extraction.model
              : context.directScreenshotOcrModel,
          directScreenshotSummary: null,
        },
        currentStep: "knowledge_upsert",
        lastProcessedChunkIndex: payload.lastProcessedChunkIndex ?? 0,
      }),
      directScreenshotText:
        !context.screenshotSession && cleanMeaningfulText(extraction.extractedText)
          ? cleanMeaningfulText(extraction.extractedText)
          : context.directScreenshotText,
      directScreenshotOcrModel:
        !context.screenshotSession && extraction.model
          ? extraction.model
          : context.directScreenshotOcrModel,
      directScreenshotSummary: null,
    });

    await updateJobPayload(job.id, nextPayload);
    return nextPayload;
  }

  const mergedRawText = cleanText(
    context.screenshotSession
      ? context.screenshotSession.chunks
          .filter((chunk) => chunk.ocrStatus === "completed")
          .map((chunk) => chunk.extractedText || "")
          .join("\n\n")
      : context.directScreenshotText,
  );

  if (!mergedRawText) {
    const nextPayload = buildPayloadForContext({
      payload,
      context,
      currentStep: "knowledge_upsert",
      lastProcessedChunkIndex: payload.lastProcessedChunkIndex ?? null,
    });

    await updateJobPayload(job.id, nextPayload);
    return nextPayload;
  }

  const structured = await extractStructuredSourceFieldsFromText({
    pageTitle: context.sourceTitle,
    pageUrl: context.sourceUrl,
    selectedText: context.selectedText,
    extractedText: mergedRawText,
  });

  await applyClickyExtractionToRecords({
    note: context.note,
    selectedText: structured.selectedText,
    title: structured.title,
    url: structured.url,
    authors: structured.authors,
    abstract: structured.abstract,
    publicationDate: structured.publicationDate,
  });

  const missingStructuredFields = [
    cleanMeaningfulTitle(structured.title) ? null : "title",
    cleanMeaningfulText(structured.url) ? null : "url",
    structured.authors.length > 0 ? null : "authors",
    cleanMeaningfulText(structured.abstract) ? null : "abstract",
    cleanMeaningfulText(structured.selectedText) ? null : "selectedText",
    cleanMeaningfulText(structured.publicationDate) ? null : "publicationDate",
  ].filter((value): value is string => Boolean(value));

  console.info(`${processingLogPrefix} structured source field extraction completed`, {
    jobId: job.id,
    noteId: context.note.id,
    captureOrigin: context.captureOrigin,
    usedOcrText: true,
    usedImages: false,
    missingStructuredFields,
  });

  const nextPayload = processingJobPayloadSchema.parse({
    ...buildPayloadForContext({
      payload,
      context: {
        ...context,
        directScreenshotSummary: null,
      },
      currentStep: "knowledge_upsert",
      lastProcessedChunkIndex: payload.lastProcessedChunkIndex ?? 0,
    }),
    directScreenshotSummary: null,
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
  const screenshotImportantText = cleanText(
    context.screenshotSession
      ? context.screenshotSession.chunks
          .filter((chunk) => chunk.ocrStatus === "completed")
          .map((chunk) => chunk.extractedText || "")
          .join("\n\n")
      : context.directScreenshotText,
  );
  const existingAuthors = coerceAuthors(finalNote.source?.authors);
  const existingPublicationDate =
    finalNote.source?.publicationDate?.toISOString().slice(0, 10) || null;

  console.info(
    `${processingLogPrefix} note knowledge worker assembled inputs`,
    {
      jobId: job.id,
      noteId: finalNote.id,
      captureOrigin: context.captureOrigin,
      sourceUrl: context.sourceUrl,
      sourceTitle: context.sourceTitle,
      selectedTextLength: context.selectedText?.length ?? 0,
      userCommentLength: context.userCommentary?.length ?? 0,
      transcriptLength: context.transcriptText?.length ?? 0,
      screenshotImportantLength: screenshotImportantText?.length ?? 0,
      existingAuthorsCount: existingAuthors.length,
    },
  );

  const sourceSummary = await buildGroundedSourceSummary({
    selectedText: finalNote.selectedText,
    userComment: context.userCommentary,
    transcriptText: context.transcriptText,
    sourceTitle: context.sourceTitle,
    sourceUrl: context.sourceUrl,
    authors: existingAuthors,
    abstract: finalNote.source?.abstract || null,
    publicationDate: existingPublicationDate,
    extractedText: screenshotImportantText,
  });

  const knowledge = await buildNoteKnowledge({
    selectedText: finalNote.selectedText,
    userComment: context.userCommentary,
    screenshotImportantText,
    transcriptText: context.transcriptText,
    sourceSummary: sourceSummary.summary,
    sourceTitle: context.sourceTitle,
    sourceUrl: context.sourceUrl,
    sourceAbstract: finalNote.source?.abstract || null,
    authors: existingAuthors,
    publicationDate: existingPublicationDate,
  });

  const sourceSnapshot = asJsonValue({
    sourceUrl: context.sourceUrl,
    sourceTitle: context.sourceTitle,
    selectedText: context.selectedText,
    transcriptText: context.transcriptText,
    extractedText: screenshotImportantText,
    sourceSummary: sourceSummary.summary,
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
    title: context.sourceTitle,
    authors: existingAuthors,
    publicationDate: existingPublicationDate,
    abstract: finalNote.source?.abstract || null,
    summary: sourceSummary.summary,
    keyFindings: knowledge.keyFindings,
    userView: knowledge.userView,
    conclusion: knowledge.conclusion,
    model: knowledge.model || sourceSummary.model || getProcessingModel(),
    sourceSnapshot,
  });

  const noteKnowledge = await db.noteKnowledge.upsert({
    where: { noteId: finalNote.id },
    update: {
      sourceId: finalNote.sourceId,
      projectId: finalNote.projectId,
      sessionId: finalNote.sessionId,
      title: context.sourceTitle,
      authors: asJsonValue(existingAuthors),
      publicationDate: existingPublicationDate,
      abstract: finalNote.source?.abstract || null,
      summary: sourceSummary.summary,
      keyFindings: knowledge.keyFindings,
      userView: knowledge.userView,
      conclusion: knowledge.conclusion,
      model: knowledge.model || sourceSummary.model || getProcessingModel(),
      sourceSnapshot,
      updatedAt: new Date(),
    },
    create: {
      noteId: finalNote.id,
      sourceId: finalNote.sourceId,
      projectId: finalNote.projectId,
      sessionId: finalNote.sessionId,
      title: context.sourceTitle,
      authors: asJsonValue(existingAuthors),
      publicationDate: existingPublicationDate,
      abstract: finalNote.source?.abstract || null,
      summary: sourceSummary.summary,
      keyFindings: knowledge.keyFindings,
      userView: knowledge.userView,
      conclusion: knowledge.conclusion,
      model: knowledge.model || sourceSummary.model || getProcessingModel(),
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
