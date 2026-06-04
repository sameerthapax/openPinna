import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  claimProcessingJobs,
  enqueueProcessingJob,
  markProcessingJobFailed,
  markProcessingJobSucceeded,
} from "@/src/processing/processingJobRepository";
import { ProcessingJobPayload } from "@/src/processing/processingTypes";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function buildValidationPayload(
  input: Partial<ProcessingJobPayload> = {},
): ProcessingJobPayload {
  return {
    sourceUrl: input.sourceUrl ?? null,
    pageTitle: input.pageTitle ?? null,
    selectedText: input.selectedText ?? null,
    userComment: input.userComment ?? null,
    hasAudio: input.hasAudio ?? false,
    hasScreenshots: input.hasScreenshots ?? false,
    screenshotId: input.screenshotId ?? null,
    audioId: input.audioId ?? null,
    captureIds: input.captureIds ?? [],
    currentStep: input.currentStep ?? "retrieval",
    selectedScreenshotChunkIds: input.selectedScreenshotChunkIds ?? [],
    selectedScreenshotChunkCount: input.selectedScreenshotChunkCount ?? 0,
    lastProcessedChunkIndex: input.lastProcessedChunkIndex ?? null,
    retrievalSnapshot: input.retrievalSnapshot ?? null,
  };
}

async function main() {
  const suffix = randomUUID();
  const project = await db.project.create({
    data: {
      title: `Processing Validation ${suffix}`,
    },
  });

  try {
    const session = await db.session.create({
      data: {
        projectId: project.id,
        sessionKey: new Date("2026-06-02T00:00:00.000Z"),
        title: "Processing Validation Session",
      },
    });

    const note = await db.note.create({
      data: {
        projectId: project.id,
        sessionId: session.id,
        noteText: "Validation note",
        userCommentary: "Validation comment",
      },
    });

    const firstJob = await enqueueProcessingJob({
      jobType: "process_note_knowledge_base",
      projectId: project.id,
      sessionId: session.id,
      noteId: note.id,
      payload: buildValidationPayload({
        sourceUrl: "https://example.com",
        pageTitle: "Validation Source",
        selectedText: "Validation note",
        userComment: "Validation comment",
        hasAudio: false,
        hasScreenshots: false,
        captureIds: [],
      }),
      maxAttempts: 2,
    });

    const duplicateJob = await enqueueProcessingJob({
      jobType: "process_note_knowledge_base",
      projectId: project.id,
      sessionId: session.id,
      noteId: note.id,
      payload: buildValidationPayload({
        sourceUrl: "https://example.com/updated",
        pageTitle: "Validation Source Updated",
        selectedText: "Validation note",
        userComment: "Validation comment updated",
        hasAudio: false,
        hasScreenshots: false,
        captureIds: [],
      }),
      maxAttempts: 2,
    });

    assert(
      firstJob.id === duplicateJob.id,
      "enqueueProcessingJob should be idempotent",
    );

    const claimedFirstPass = await claimProcessingJobs(
      5,
      `validate-worker-${suffix}`,
    );
    assert(
      claimedFirstPass.length >= 1,
      "claimProcessingJobs should claim the enqueued job",
    );
    assert(
      claimedFirstPass.length <= 5,
      "claimProcessingJobs should honor the limit",
    );

    const claimedJob = claimedFirstPass.find((job) => job.id === firstJob.id);
    assert(claimedJob, "Expected first job to be claimed");

    await markProcessingJobFailed(claimedJob, "first failure");

    const retriedJob = await db.processingJobOutbox.findUnique({
      where: { id: firstJob.id },
    });
    assert(
      retriedJob?.attempts === 1,
      "failed job should keep incremented attempts",
    );
    assert(
      retriedJob?.status === "pending",
      "failed job under max attempts should return to pending",
    );
    assert(retriedJob?.runAfter, "failed job should be rescheduled");

    await db.processingJobOutbox.update({
      where: { id: firstJob.id },
      data: {
        runAfter: new Date(),
        updatedAt: new Date(),
      },
    });

    const claimedSecondPass = await claimProcessingJobs(
      5,
      `validate-worker-retry-${suffix}`,
    );
    const retryClaim = claimedSecondPass.find((job) => job.id === firstJob.id);
    assert(retryClaim, "Expected retried job to be claimed again");

    await markProcessingJobSucceeded(retryClaim);

    const completedOutboxJob = await db.processingJobOutbox.findUnique({
      where: { id: firstJob.id },
    });
    const completedHistoryJob = await db.processingJobHistory.findUnique({
      where: { id: firstJob.id },
    });
    assert(!completedOutboxJob, "successful job should be removed from outbox");
    assert(
      completedHistoryJob?.finalStatus === "completed",
      "successful job should move to history",
    );

    const batchJobs = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        enqueueProcessingJob({
          jobType: "process_note_knowledge_base",
          projectId: project.id,
          sessionId: session.id,
          voiceSessionId: randomUUID(),
          payload: buildValidationPayload({
            sourceUrl: `https://example.com/batch-${index}`,
            pageTitle: `Batch Source ${index}`,
            selectedText: "Batch validation note",
            userComment: null,
            hasAudio: false,
            hasScreenshots: false,
            captureIds: [],
          }),
          maxAttempts: 1,
        }),
      ),
    );

    const claimedBatch = await claimProcessingJobs(
      5,
      `validate-worker-batch-${suffix}`,
    );
    assert(
      claimedBatch.length === 5,
      "claimProcessingJobs should cap claims at 5 jobs",
    );

    for (const claimed of claimedBatch) {
      await markProcessingJobFailed(claimed, "batch cleanup");
    }

    const claimedBatchRemainder = await claimProcessingJobs(
      5,
      `validate-worker-batch-remainder-${suffix}`,
    );
    assert(
      claimedBatchRemainder.length === 1,
      "claimProcessingJobs should leave the sixth job for the next claim",
    );

    await markProcessingJobFailed(
      claimedBatchRemainder[0],
      "batch cleanup remainder",
    );

    for (const batchJob of batchJobs) {
      const historyJob = await db.processingJobHistory.findUnique({
        where: { id: batchJob.id },
      });
      assert(
        historyJob?.finalStatus === "failed",
        "batch jobs should move to history after cleanup",
      );
    }

    const failingJob = await enqueueProcessingJob({
      jobType: "process_note_knowledge_base",
      projectId: project.id,
      sessionId: session.id,
      noteId: note.id,
      voiceSessionId: randomUUID(),
      payload: buildValidationPayload({
        sourceUrl: "https://example.com/failing",
        pageTitle: "Failing Source",
        selectedText: "Validation note",
        userComment: "Validation comment",
        hasAudio: false,
        hasScreenshots: false,
        captureIds: [],
      }),
      maxAttempts: 1,
    });

    const claimedFailurePass = await claimProcessingJobs(
      5,
      `validate-worker-fail-${suffix}`,
    );
    const failingClaim = claimedFailurePass.find(
      (job) => job.id === failingJob.id,
    );
    assert(failingClaim, "Expected failing job to be claimed");

    await markProcessingJobFailed(failingClaim, "permanent failure");

    const failedOutboxJob = await db.processingJobOutbox.findUnique({
      where: { id: failingJob.id },
    });
    const failedHistoryJob = await db.processingJobHistory.findUnique({
      where: { id: failingJob.id },
    });
    assert(!failedOutboxJob, "exhausted job should be removed from outbox");
    assert(
      failedHistoryJob?.finalStatus === "failed",
      "exhausted job should move to failed history",
    );

    console.info("Processing repository validation passed.");
  } finally {
    await db.processingJobOutbox.deleteMany({
      where: { projectId: project.id },
    });
    await db.processingJobHistory.deleteMany({
      where: { projectId: project.id },
    });
    await db.noteKnowledge.deleteMany({ where: { projectId: project.id } });
    await db.screenshotCaptureProcessing.deleteMany({
      where: { sourceId: null, noteId: null },
    });
    await db.project
      .delete({ where: { id: project.id } })
      .catch(() => undefined);
    await db.$disconnect();
  }
}

void main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await db.$disconnect();
  process.exit(1);
});
