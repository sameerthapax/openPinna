import path from "node:path";
import { pathToFileURL } from "node:url";
import { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { enqueueProcessingJob } from "@/src/processing/processingJobRepository";
import {
  runProcessingSchedulerOnce,
  startProcessingScheduler,
} from "@/src/processing/processingScheduler";
import { processingLogPrefix } from "@/src/processing/processingTypes";

type DbClient = PrismaClient | Prisma.TransactionClient;

function asPayloadArray(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

async function loadNoteProcessingContext(noteId: string, client: DbClient) {
  return client.note.findUnique({
    where: { id: noteId },
    include: {
      source: true,
      capture: true,
      voiceSession: {
        include: {
          screenshotSession: true,
        },
      },
      voiceAudio: true,
    },
  });
}

export async function enqueueNoteKnowledgeJobForNoteId(
  noteId: string,
  client: DbClient = db,
) {
  console.info(`${processingLogPrefix} load note context for enqueue`, {
    noteId,
  });

  const note = await loadNoteProcessingContext(noteId, client);

  if (!note) {
    throw new Error("PROCESSING_NOTE_NOT_FOUND");
  }

  const screenshotId = note.voiceSession?.screenshotSession?.id || null;
  const captureIds = asPayloadArray([
    note.captureId,
    note.voiceSession?.screenshotSession?.captureId || null,
  ]);
  const sourceUrl =
    note.source?.url ||
    note.voiceSession?.pageUrl ||
    note.capture?.originalUrl ||
    null;
  const pageTitle =
    note.source?.title ||
    note.voiceSession?.pageTitle ||
    note.capture?.title ||
    null;
  const selectedText =
    note.capture?.selectedText ||
    note.voiceSession?.selectedText ||
    null;
  const userComment = note.userCommentary || null;
  const captureOrigin =
    note.capture?.sourceLabel ||
    (note.voiceSession?.screenshotSession?.sourceJson &&
    typeof note.voiceSession.screenshotSession.sourceJson === "object" &&
    !Array.isArray(note.voiceSession.screenshotSession.sourceJson) &&
    typeof (
      note.voiceSession.screenshotSession.sourceJson as Record<string, unknown>
    )?.metadata === "object"
      ? (
          (
            note.voiceSession.screenshotSession.sourceJson as Record<
              string,
              unknown
            >
          ).metadata as Record<string, unknown>
        )?.captureOrigin
      : null) ||
    null;

  console.info(`${processingLogPrefix} enqueue note knowledge job`, {
    noteId: note.id,
    projectId: note.projectId,
    sessionId: note.sessionId,
    sourceId: note.sourceId,
    voiceSessionId: note.voiceSessionId,
    audioId: note.voiceAudioId,
    screenshotId,
    captureIds,
    hasAudio: Boolean(note.voiceAudioId),
    hasScreenshots: Boolean(screenshotId || captureIds.length > 0),
  });

  return enqueueProcessingJob(
    {
      jobType: "process_note_knowledge_base",
      projectId: note.projectId,
      sessionId: note.sessionId,
      noteId: note.id,
      sourceId: note.sourceId,
      voiceSessionId: note.voiceSessionId,
      audioId: note.voiceAudioId,
      screenshotId,
      captureId: note.captureId,
      payload: {
        sourceUrl,
        pageTitle,
        selectedText,
        userComment,
        captureOrigin: typeof captureOrigin === "string" ? captureOrigin : null,
        hasAudio: Boolean(note.voiceAudioId),
        hasScreenshots: Boolean(screenshotId || captureIds.length > 0),
        screenshotId,
        audioId: note.voiceAudioId,
        captureIds,
        directScreenshotText: null,
        directScreenshotOcrModel: null,
        directScreenshotSummary: null,
        currentStep: "retrieval",
        selectedScreenshotChunkIds: [],
        selectedScreenshotChunkCount: 0,
        lastProcessedChunkIndex: null,
        retrievalSnapshot: null,
      },
    },
    client,
  );
}

export {
  runProcessingSchedulerOnce,
  startProcessingScheduler,
} from "@/src/processing/processingScheduler";

async function main() {
  if (process.argv.includes("--run-once")) {
    const result = await runProcessingSchedulerOnce();
    console.info(`${processingLogPrefix} run-once complete`, result);
    return;
  }

  const scheduler = startProcessingScheduler();

  const stop = () => {
    scheduler.stop();
    process.exit(0);
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

const entryArg = process.argv[1] ? path.resolve(process.argv[1]) : null;

if (entryArg && import.meta.url === pathToFileURL(entryArg).href) {
  void main().catch((error) => {
    console.error(`${processingLogPrefix} bootstrap failed`, {
      message:
        error instanceof Error ? error.message : "Unknown bootstrap error.",
    });
    process.exit(1);
  });
}
