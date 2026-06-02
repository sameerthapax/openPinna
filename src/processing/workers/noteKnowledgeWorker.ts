import { readFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  buildNoteKnowledge,
  extractImportantTextFromScreenshot,
  extractSourceMetadataAndSummary,
  getProcessingModel,
} from "@/src/processing/openaiProcessingClient";
import { ProcessingJobRecord, processingLogPrefix } from "@/src/processing/processingTypes";

function asJsonValue(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function coerceAuthors(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function resolveStoredPath(filePath: string | null | undefined) {
  if (!filePath) {
    return null;
  }

  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

function isSupportedImage(filePath: string | null) {
  if (!filePath) {
    return false;
  }

  const extension = path.extname(filePath).toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp"].includes(extension);
}

async function ensureReadable(filePath: string | null) {
  if (!filePath) {
    return null;
  }

  await readFile(filePath);
  return filePath;
}

// Screenshot processing is stored once per full screenshot session or final capture so reruns reuse extracted text.
async function loadImportantScreenshotText(input: {
  noteId: string;
  sourceId?: string | null;
  screenshotSession?: {
    id: string;
    captureId: string | null;
    pageUrl: string | null;
    pageTitle: string | null;
    selectedText: string | null;
    fullImagePath: string | null;
  } | null;
  capture?: {
    id: string;
    originalUrl: string | null;
    title: string | null;
    selectedText: string | null;
    storagePath: string | null;
    imagePath: string;
  } | null;
}) {
  const screenshotId = input.screenshotSession?.id ?? null;
  const captureId = input.capture?.id ?? input.screenshotSession?.captureId ?? null;

  console.info(`${processingLogPrefix} screenshot processing lookup`, {
    noteId: input.noteId,
    sourceId: input.sourceId ?? null,
    screenshotId,
    captureId,
  });

  if (!screenshotId && !captureId) {
    console.info(`${processingLogPrefix} screenshot processing skipped: no screenshot or capture`, {
      noteId: input.noteId,
    });
    return "";
  }

  const existing =
    screenshotId
      ? await db.screenshotCaptureProcessing.findUnique({ where: { screenshotId } })
      : captureId
        ? await db.screenshotCaptureProcessing.findUnique({ where: { captureId } })
        : null;

  if (existing?.importantText) {
    console.info(`${processingLogPrefix} screenshot processing cache hit`, {
      noteId: input.noteId,
      processingId: existing.id,
      screenshotId,
      captureId,
    });
    return existing.importantText;
  }

  const imagePath =
    resolveStoredPath(input.screenshotSession?.fullImagePath) ||
    resolveStoredPath(input.capture?.storagePath) ||
    resolveStoredPath(input.capture?.imagePath);

  if (!isSupportedImage(imagePath)) {
    console.info(`${processingLogPrefix} screenshot processing skipped: unsupported image`, {
      noteId: input.noteId,
      screenshotId,
      captureId,
      imagePath,
    });

    if (existing) {
      await db.screenshotCaptureProcessing.update({
        where: { id: existing.id },
        data: {
          status: "skipped",
          lastError: "No supported screenshot image was available for processing.",
          updatedAt: new Date(),
        },
      });
    } else if (screenshotId || captureId) {
      await db.screenshotCaptureProcessing.create({
        data: {
          screenshotId,
          captureId,
          sourceId: input.sourceId ?? null,
          noteId: input.noteId,
          status: "skipped",
          lastError: "No supported screenshot image was available for processing.",
        },
      });
    }

    return "";
  }

  const readablePath = await ensureReadable(imagePath);
  if (!readablePath) {
    console.info(`${processingLogPrefix} screenshot processing skipped: unreadable image`, {
      noteId: input.noteId,
      screenshotId,
      captureId,
    });
    return "";
  }

  const processingRecord = existing
    ? await db.screenshotCaptureProcessing.update({
        where: { id: existing.id },
        data: {
          screenshotId,
          captureId,
          sourceId: input.sourceId ?? null,
          noteId: input.noteId,
          status: "processing",
          lastError: null,
          updatedAt: new Date(),
        },
      })
    : await db.screenshotCaptureProcessing.create({
        data: {
          screenshotId,
          captureId,
          sourceId: input.sourceId ?? null,
          noteId: input.noteId,
          status: "processing",
        },
      });

  console.info(`${processingLogPrefix} screenshot processing started`, {
    noteId: input.noteId,
    processingId: processingRecord.id,
    screenshotId,
    captureId,
    imagePath: readablePath,
  });

  try {
    const extracted = await extractImportantTextFromScreenshot({
      imagePath: readablePath,
      pageTitle: input.screenshotSession?.pageTitle ?? input.capture?.title ?? null,
      pageUrl: input.screenshotSession?.pageUrl ?? input.capture?.originalUrl ?? null,
      selectedText: input.screenshotSession?.selectedText ?? input.capture?.selectedText ?? null,
    });

    await db.screenshotCaptureProcessing.update({
      where: { id: processingRecord.id },
      data: {
        status: "completed",
        extractedText: extracted.extractedText,
        importantText: extracted.importantText,
        model: extracted.model,
        processedAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      },
    });

    console.info(`${processingLogPrefix} screenshot processing completed`, {
      noteId: input.noteId,
      processingId: processingRecord.id,
      screenshotId,
      captureId,
      extractedLength: extracted.extractedText.length,
      importantLength: extracted.importantText.length,
      model: extracted.model,
    });

    return extracted.importantText;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Screenshot extraction failed.";

    console.error(`${processingLogPrefix} screenshot processing failed`, {
      noteId: input.noteId,
      processingId: processingRecord.id,
      screenshotId,
      captureId,
      message,
    });

    await db.screenshotCaptureProcessing.update({
      where: { id: processingRecord.id },
      data: {
        status: "failed",
        lastError: message,
        updatedAt: new Date(),
      },
    });

    throw error;
  }
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

  const note = await db.note.findUnique({
    where: { id: job.noteId },
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

  if (!note) {
    throw new Error("PROCESSING_NOTE_NOT_FOUND");
  }

  console.info(`${processingLogPrefix} note knowledge worker loaded note context`, {
    jobId: job.id,
    noteId: note.id,
    sourceId: note.sourceId,
    captureId: note.captureId,
    voiceSessionId: note.voiceSessionId,
    voiceAudioId: note.voiceAudioId,
    hasSource: Boolean(note.source),
    hasCapture: Boolean(note.capture),
    hasVoiceSession: Boolean(note.voiceSession),
    hasTranscript: Boolean(note.voiceAudio?.finalTranscript || note.voiceSession?.audio?.finalTranscript),
    hasScreenshotSession: Boolean(note.voiceSession?.screenshotSession),
  });

  const screenshotImportantText = await loadImportantScreenshotText({
    noteId: note.id,
    sourceId: note.sourceId,
    screenshotSession: note.voiceSession?.screenshotSession
      ? {
          id: note.voiceSession.screenshotSession.id,
          captureId: note.voiceSession.screenshotSession.captureId,
          pageUrl: note.voiceSession.screenshotSession.pageUrl,
          pageTitle: note.voiceSession.screenshotSession.pageTitle,
          selectedText: note.voiceSession.screenshotSession.selectedText,
          fullImagePath: note.voiceSession.screenshotSession.fullImagePath,
        }
      : null,
    capture: note.capture
      ? {
          id: note.capture.id,
          originalUrl: note.capture.originalUrl,
          title: note.capture.title,
          selectedText: note.capture.selectedText,
          storagePath: note.capture.storagePath,
          imagePath: note.capture.imagePath,
        }
      : null,
  });

  const transcriptText =
    note.voiceAudio?.finalTranscript || note.voiceSession?.audio?.finalTranscript || null;
  const selectedText =
    note.capture?.selectedText || note.voiceSession?.selectedText || job.payload.selectedText || note.noteText;
  const sourceUrl = note.source?.url || note.voiceSession?.pageUrl || note.capture?.originalUrl || job.payload.sourceUrl || null;
  const sourceTitle = note.source?.title || note.voiceSession?.pageTitle || note.capture?.title || job.payload.pageTitle || null;
  const existingAuthors = coerceAuthors(note.source?.authors);
  const existingPublicationDate =
    note.source?.publicationDate?.toISOString().slice(0, 10) || null;

  console.info(`${processingLogPrefix} note knowledge worker assembled inputs`, {
    jobId: job.id,
    noteId: note.id,
    sourceUrl,
    sourceTitle,
    selectedTextLength: selectedText?.length ?? 0,
    userCommentLength: (note.userCommentary || job.payload.userComment || "").length,
    transcriptLength: transcriptText?.length ?? 0,
    screenshotImportantLength: screenshotImportantText.length,
    existingAuthorsCount: existingAuthors.length,
  });

  const metadataSummary = await extractSourceMetadataAndSummary({
    noteText: note.noteText,
    selectedText,
    userComment: note.userCommentary || job.payload.userComment || null,
    screenshotImportantText,
    transcriptText,
    sourceTitle,
    sourceUrl,
    existingAuthors,
    existingAbstract: note.source?.abstract || null,
    existingPublicationDate,
  });

  console.info(`${processingLogPrefix} note knowledge worker extracted metadata summary`, {
    jobId: job.id,
    noteId: note.id,
    title: metadataSummary.title,
    authorsCount: metadataSummary.authors.length,
    hasAbstract: Boolean(metadataSummary.abstract),
    hasSummary: Boolean(metadataSummary.summary),
    model: metadataSummary.model,
  });

  const knowledge = await buildNoteKnowledge({
    noteText: note.noteText,
    selectedText,
    userComment: note.userCommentary || job.payload.userComment || null,
    screenshotImportantText,
    transcriptText,
    sourceSummary: metadataSummary.summary,
    sourceTitle: metadataSummary.title || sourceTitle,
    sourceUrl,
    sourceAbstract: metadataSummary.abstract || note.source?.abstract || null,
    authors: metadataSummary.authors.length > 0 ? metadataSummary.authors : existingAuthors,
    publicationDate: metadataSummary.publicationDate || existingPublicationDate,
  });

  console.info(`${processingLogPrefix} note knowledge worker built knowledge sections`, {
    jobId: job.id,
    noteId: note.id,
    keyFindingsLength: knowledge.keyFindings.length,
    userViewLength: knowledge.userView.length,
    conclusionLength: knowledge.conclusion.length,
    model: knowledge.model,
  });

  const noteKnowledge = await db.noteKnowledge.upsert({
    where: { noteId: note.id },
    update: {
      sourceId: note.sourceId,
      projectId: note.projectId,
      sessionId: note.sessionId,
      title: metadataSummary.title || sourceTitle,
      authors: asJsonValue(metadataSummary.authors.length > 0 ? metadataSummary.authors : existingAuthors),
      publicationDate: metadataSummary.publicationDate || existingPublicationDate,
      abstract: metadataSummary.abstract || note.source?.abstract || null,
      summary: metadataSummary.summary,
      keyFindings: knowledge.keyFindings,
      userView: knowledge.userView,
      conclusion: knowledge.conclusion,
      model: knowledge.model || metadataSummary.model || getProcessingModel(),
      sourceSnapshot: asJsonValue({
        sourceUrl,
        sourceTitle,
        selectedText,
        transcriptText,
        screenshotImportantText,
        existingSourceMetadata: note.source
          ? {
              title: note.source.title,
              authors: existingAuthors,
              abstract: note.source.abstract,
              publicationDate: existingPublicationDate,
              metadata: note.source.metadata,
            }
          : null,
      }),
      updatedAt: new Date(),
    },
    create: {
      noteId: note.id,
      sourceId: note.sourceId,
      projectId: note.projectId,
      sessionId: note.sessionId,
      title: metadataSummary.title || sourceTitle,
      authors: asJsonValue(metadataSummary.authors.length > 0 ? metadataSummary.authors : existingAuthors),
      publicationDate: metadataSummary.publicationDate || existingPublicationDate,
      abstract: metadataSummary.abstract || note.source?.abstract || null,
      summary: metadataSummary.summary,
      keyFindings: knowledge.keyFindings,
      userView: knowledge.userView,
      conclusion: knowledge.conclusion,
      model: knowledge.model || metadataSummary.model || getProcessingModel(),
      sourceSnapshot: asJsonValue({
        sourceUrl,
        sourceTitle,
        selectedText,
        transcriptText,
        screenshotImportantText,
        existingSourceMetadata: note.source
          ? {
              title: note.source.title,
              authors: existingAuthors,
              abstract: note.source.abstract,
              publicationDate: existingPublicationDate,
              metadata: note.source.metadata,
            }
          : null,
      }),
    },
  });

  await db.note.update({
    where: { id: note.id },
    data: {
      noteKnowledgeId: noteKnowledge.id,
      updatedAt: new Date(),
    },
  });

  console.info(`${processingLogPrefix} note knowledge worker upserted note knowledge`, {
    jobId: job.id,
    noteId: note.id,
    noteKnowledgeId: noteKnowledge.id,
    sourceId: noteKnowledge.sourceId,
    projectId: noteKnowledge.projectId,
    sessionId: noteKnowledge.sessionId,
  });

  console.info(`${processingLogPrefix} note knowledge worker completed`, {
    jobId: job.id,
    noteId: note.id,
  });

  return noteKnowledge;
}
