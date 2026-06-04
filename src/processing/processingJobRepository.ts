import { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import {
  DeferredProcessingError,
  EnqueueProcessingJobInput,
  ProcessingJobPayload,
  ProcessingJobRecord,
  processingLogPrefix,
  processingJobPayloadSchema,
  processingJobRecordSchema,
} from "@/src/processing/processingTypes";

type DbClient = PrismaClient | Prisma.TransactionClient;

const retryDelayMs = 5 * 60 * 1000;

function normalizePayload(payload: ProcessingJobPayload) {
  return processingJobPayloadSchema.parse({
    sourceUrl: payload.sourceUrl ?? null,
    pageTitle: payload.pageTitle ?? null,
    selectedText: payload.selectedText ?? null,
    userComment: payload.userComment ?? null,
    hasAudio: Boolean(payload.hasAudio),
    hasScreenshots: Boolean(payload.hasScreenshots),
    screenshotId: payload.screenshotId ?? null,
    audioId: payload.audioId ?? null,
    captureIds: payload.captureIds ?? [],
    currentStep: payload.currentStep ?? "retrieval",
    selectedScreenshotChunkIds: payload.selectedScreenshotChunkIds ?? [],
    selectedScreenshotChunkCount: payload.selectedScreenshotChunkCount ?? 0,
    lastProcessedChunkIndex: payload.lastProcessedChunkIndex ?? null,
    retrievalSnapshot: payload.retrievalSnapshot ?? null,
  });
}

function parseJobRecord(record: {
  id: string;
  jobType: string;
  status: string;
  projectId: string | null;
  sessionId: string | null;
  noteId: string | null;
  sourceId: string | null;
  voiceSessionId: string | null;
  audioId: string | null;
  screenshotId: string | null;
  captureId: string | null;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
  runAfter: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return processingJobRecordSchema.parse({
    ...record,
    payload: normalizePayload(
      processingJobPayloadSchema.parse(record.payload ?? {}),
    ),
  });
}

function nextRetryTime(attempts: number) {
  return new Date(Date.now() + retryDelayMs * Math.max(1, attempts));
}

function buildMergeData(input: EnqueueProcessingJobInput) {
  const payload = normalizePayload(input.payload);

  return {
    projectId: input.projectId ?? null,
    sessionId: input.sessionId ?? null,
    noteId: input.noteId ?? null,
    sourceId: input.sourceId ?? null,
    voiceSessionId: input.voiceSessionId ?? null,
    audioId: input.audioId ?? null,
    screenshotId: input.screenshotId ?? null,
    captureId: input.captureId ?? null,
    payload: payload as Prisma.InputJsonValue,
    maxAttempts: input.maxAttempts ?? 3,
    runAfter: input.runAfter ?? new Date(),
    updatedAt: new Date(),
    lastError: null,
  };
}

async function findExistingJob(
  client: DbClient,
  input: EnqueueProcessingJobInput,
) {
  if (input.noteId) {
    return client.processingJobOutbox.findFirst({
      where: {
        jobType: input.jobType,
        noteId: input.noteId,
      },
    });
  }

  if (input.voiceSessionId) {
    return client.processingJobOutbox.findFirst({
      where: {
        jobType: input.jobType,
        voiceSessionId: input.voiceSessionId,
      },
    });
  }

  return null;
}

// The outbox holds only active work, so enqueue updates matching rows instead of creating duplicates.
export async function enqueueProcessingJob(
  input: EnqueueProcessingJobInput,
  client: DbClient = db,
): Promise<ProcessingJobRecord> {
  console.info(`${processingLogPrefix} enqueue requested`, {
    jobType: input.jobType,
    noteId: input.noteId ?? null,
    voiceSessionId: input.voiceSessionId ?? null,
    sourceId: input.sourceId ?? null,
    captureId: input.captureId ?? null,
    screenshotId: input.screenshotId ?? null,
  });

  const mergedData = buildMergeData(input);
  const existing = await findExistingJob(client, input);

  if (existing) {
    console.info(`${processingLogPrefix} enqueue deduped existing outbox job`, {
      jobId: existing.id,
      jobType: existing.jobType,
      status: existing.status,
      noteId: existing.noteId,
      voiceSessionId: existing.voiceSessionId,
    });

    const updated = await client.processingJobOutbox.update({
      where: { id: existing.id },
      data: {
        ...mergedData,
        status: existing.status === "processing" ? existing.status : "pending",
        lockedAt: existing.status === "processing" ? existing.lockedAt : null,
        lockedBy: existing.status === "processing" ? existing.lockedBy : null,
      },
    });

    console.info(`${processingLogPrefix} enqueue updated outbox job`, {
      jobId: updated.id,
      status: updated.status,
      attempts: updated.attempts,
      runAfter: updated.runAfter.toISOString(),
    });

    return parseJobRecord(updated);
  }

  const created = await client.processingJobOutbox.create({
    data: {
      jobType: input.jobType,
      status: "pending",
      ...mergedData,
      attempts: 0,
      createdAt: new Date(),
    },
  });

  console.info(`${processingLogPrefix} enqueue created outbox job`, {
    jobId: created.id,
    jobType: created.jobType,
    noteId: created.noteId,
    voiceSessionId: created.voiceSessionId,
    runAfter: created.runAfter.toISOString(),
  });

  return parseJobRecord(created);
}

export async function claimProcessingJobs(
  limit = 5,
  workerId: string,
  client: DbClient = db,
): Promise<ProcessingJobRecord[]> {
  console.info(`${processingLogPrefix} claim requested`, {
    workerId,
    limit,
  });

  const claimed = await client.$queryRaw<
    Array<{
      id: string;
      jobType: string;
      status: string;
      projectId: string | null;
      sessionId: string | null;
      noteId: string | null;
      sourceId: string | null;
      voiceSessionId: string | null;
      audioId: string | null;
      screenshotId: string | null;
      captureId: string | null;
      payload: unknown;
      attempts: number;
      maxAttempts: number;
      runAfter: Date;
      lockedAt: Date | null;
      lockedBy: string | null;
      lastError: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>
  >(Prisma.sql`
    WITH claimed AS (
      SELECT id
      FROM processing_job_outbox
      WHERE status = 'pending'
        AND run_after <= NOW()
      ORDER BY created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE processing_job_outbox AS job
    SET
      status = 'processing',
      locked_at = NOW(),
      locked_by = ${workerId},
      attempts = job.attempts + 1,
      updated_at = NOW()
    FROM claimed
    WHERE job.id = claimed.id
    RETURNING
      job.id,
      job.job_type AS "jobType",
      job.status,
      job.project_id AS "projectId",
      job.session_id AS "sessionId",
      job.note_id AS "noteId",
      job.source_id AS "sourceId",
      job.voice_session_id AS "voiceSessionId",
      job.audio_id AS "audioId",
      job.screenshot_id AS "screenshotId",
      job.capture_id AS "captureId",
      job.payload,
      job.attempts,
      job.max_attempts AS "maxAttempts",
      job.run_after AS "runAfter",
      job.locked_at AS "lockedAt",
      job.locked_by AS "lockedBy",
      job.last_error AS "lastError",
      job.created_at AS "createdAt",
      job.updated_at AS "updatedAt"
  `);

  console.info(`${processingLogPrefix} claim completed`, {
    workerId,
    claimedCount: claimed.length,
    jobIds: claimed.map((job) => job.id),
  });

  return claimed.map(parseJobRecord);
}

export async function moveJobToHistory(
  job: ProcessingJobRecord,
  finalStatus: "completed" | "failed",
  error?: string,
  client: DbClient = db,
) {
  const now = new Date();
  console.info(`${processingLogPrefix} move job to history`, {
    jobId: job.id,
    jobType: job.jobType,
    finalStatus,
    error: error ?? null,
  });

  return client.processingJobHistory.upsert({
    where: { id: job.id },
    update: {
      jobType: job.jobType,
      finalStatus,
      projectId: job.projectId,
      sessionId: job.sessionId,
      noteId: job.noteId,
      sourceId: job.sourceId,
      voiceSessionId: job.voiceSessionId,
      audioId: job.audioId,
      screenshotId: job.screenshotId,
      captureId: job.captureId,
      payload: normalizePayload(job.payload) as Prisma.InputJsonValue,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      startedAt: job.lockedAt,
      completedAt: finalStatus === "completed" ? now : null,
      failedAt: finalStatus === "failed" ? now : null,
      lastError: error ?? null,
      createdAt: job.createdAt,
      updatedAt: now,
    },
    create: {
      id: job.id,
      jobType: job.jobType,
      finalStatus,
      projectId: job.projectId,
      sessionId: job.sessionId,
      noteId: job.noteId,
      sourceId: job.sourceId,
      voiceSessionId: job.voiceSessionId,
      audioId: job.audioId,
      screenshotId: job.screenshotId,
      captureId: job.captureId,
      payload: normalizePayload(job.payload) as Prisma.InputJsonValue,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      startedAt: job.lockedAt,
      completedAt: finalStatus === "completed" ? now : null,
      failedAt: finalStatus === "failed" ? now : null,
      lastError: error ?? null,
      createdAt: job.createdAt,
      updatedAt: now,
    },
  });
}

export async function deleteOutboxJob(jobId: string, client: DbClient = db) {
  console.info(`${processingLogPrefix} delete outbox job`, {
    jobId,
  });

  await client.processingJobOutbox.deleteMany({
    where: { id: jobId },
  });
}

export async function markProcessingJobSucceeded(
  job: ProcessingJobRecord,
) {
  console.info(`${processingLogPrefix} mark job succeeded`, {
    jobId: job.id,
    jobType: job.jobType,
    attempts: job.attempts,
  });

  await db.$transaction(async (tx) => {
    await moveJobToHistory(job, "completed", undefined, tx);
    await deleteOutboxJob(job.id, tx);
  });
}

export async function markProcessingJobFailed(
  job: ProcessingJobRecord,
  error: string,
  client: DbClient = db,
) {
  if (job.attempts >= job.maxAttempts) {
    console.info(`${processingLogPrefix} mark job failed permanently`, {
      jobId: job.id,
      jobType: job.jobType,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      error,
    });

    await db.$transaction(async (tx) => {
      await moveJobToHistory(job, "failed", error, tx);
      await deleteOutboxJob(job.id, tx);
    });
    return;
  }

  const nextRunAfter = nextRetryTime(job.attempts);
  console.info(`${processingLogPrefix} reschedule failed job`, {
    jobId: job.id,
    jobType: job.jobType,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    error,
    nextRunAfter: nextRunAfter.toISOString(),
  });

  await client.processingJobOutbox.update({
    where: { id: job.id },
    data: {
      status: "pending",
      runAfter: nextRunAfter,
      lockedAt: null,
      lockedBy: null,
      lastError: error,
      updatedAt: new Date(),
    },
  });
}

export async function deferProcessingJob(
  job: ProcessingJobRecord,
  deferred: DeferredProcessingError,
  client: DbClient = db,
) {
  console.info(`${processingLogPrefix} defer job`, {
    jobId: job.id,
    jobType: job.jobType,
    runAfter: deferred.runAfter.toISOString(),
    message: deferred.message,
  });

  await client.processingJobOutbox.update({
    where: { id: job.id },
    data: {
      status: "pending",
      runAfter: deferred.runAfter,
      attempts: Math.max(0, job.attempts - 1),
      lockedAt: null,
      lockedBy: null,
      lastError: deferred.message,
      updatedAt: new Date(),
    },
  });
}
