import { randomUUID } from "node:crypto";
import {
  claimProcessingJobs,
  deferProcessingJob,
  markProcessingJobFailed,
  markProcessingJobSucceeded,
} from "@/src/processing/processingJobRepository";
import { processNoteKnowledgeJob } from "@/src/processing/workers/noteKnowledgeWorker";
import {
  DeferredProcessingError,
  ProcessingJobRecord,
  processingLogPrefix,
} from "@/src/processing/processingTypes";

const schedulerIntervalMs = 5 * 60 * 1000;

async function runJob(job: ProcessingJobRecord) {
  switch (job.jobType) {
    case "process_note_knowledge_base":
      await processNoteKnowledgeJob(job);
      return;
    default:
      throw new Error(`Unsupported processing job type: ${job.jobType}`);
  }
}

export async function runProcessingSchedulerOnce(
  workerId = `processing-worker-${randomUUID()}`,
) {
  const jobs = await claimProcessingJobs(5, workerId);

  if (jobs.length === 0) {
    console.info(`${processingLogPrefix} no jobs ready`, { workerId });
    return { workerId, processedCount: 0 };
  }

  console.info(`${processingLogPrefix} claimed jobs`, {
    workerId,
    jobCount: jobs.length,
    jobIds: jobs.map((job) => job.id),
  });

  for (const job of jobs) {
    try {
      console.info(`${processingLogPrefix} processing job`, {
        workerId,
        jobId: job.id,
        jobType: job.jobType,
        attempts: job.attempts,
      });

      await runJob(job);
      await markProcessingJobSucceeded(job);

      console.info(`${processingLogPrefix} job succeeded`, {
        workerId,
        jobId: job.id,
      });
    } catch (error) {
      if (error instanceof DeferredProcessingError) {
        await deferProcessingJob(job, error);

        console.info(`${processingLogPrefix} job deferred`, {
          workerId,
          jobId: job.id,
          jobType: job.jobType,
          runAfter: error.runAfter.toISOString(),
          message: error.message,
        });
        continue;
      }

      const message =
        error instanceof Error ? error.message : "Processing job failed.";

      console.error(`${processingLogPrefix} job failed`, {
        workerId,
        jobId: job.id,
        jobType: job.jobType,
        attempts: job.attempts,
        message,
      });

      await markProcessingJobFailed(job, message);
    }
  }

  return { workerId, processedCount: jobs.length };
}

export function startProcessingScheduler(
  workerId = `processing-worker-${randomUUID()}`,
) {
  let isRunning = false;

  const tick = async () => {
    if (isRunning) {
      console.info(`${processingLogPrefix} skip overlapping tick`, {
        workerId,
      });
      return;
    }

    isRunning = true;
    try {
      await runProcessingSchedulerOnce(workerId);
    } catch (error) {
      console.error(`${processingLogPrefix} scheduler tick failed`, {
        workerId,
        message:
          error instanceof Error ? error.message : "Unknown scheduler error.",
      });
    } finally {
      isRunning = false;
    }
  };

  console.info(`${processingLogPrefix} scheduler started`, {
    workerId,
    intervalMs: schedulerIntervalMs,
  });

  void tick();
  const timer = setInterval(() => {
    void tick();
  }, schedulerIntervalMs);

  return {
    workerId,
    stop() {
      clearInterval(timer);
      console.info(`${processingLogPrefix} scheduler stopped`, { workerId });
    },
  };
}
