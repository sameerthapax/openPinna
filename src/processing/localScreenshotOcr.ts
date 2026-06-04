import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import Tesseract from "tesseract.js";
import {
  ExtractedScreenshot,
  extractedScreenshotSchema,
  processingLogPrefix,
} from "@/src/processing/processingTypes";

const { PSM, createScheduler, createWorker, setLogging } = Tesseract;

const supportedImageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const localOcrLanguage = "eng";
const localOcrModel = "tesseract.js:eng";
const defaultOcrConcurrency = 2;

type LocalScreenshotOcrTask = {
  chunkId: string;
  imagePath: string;
};

type LocalScreenshotOcrResult = {
  chunkId: string;
  extractedText: string;
  model: string;
};

export type LocalScreenshotOcrSettledResult =
  | (LocalScreenshotOcrResult & { status: "fulfilled" })
  | {
      chunkId: string;
      status: "rejected";
      error: string;
    };

function getOcrConcurrency() {
  const raw = process.env.SCREENSHOT_OCR_CONCURRENCY?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultOcrConcurrency;
  }

  return parsed;
}

function normalizeExtractedText(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

export async function validateLocalScreenshotImagePath(imagePath: string) {
  const resolvedPath = path.isAbsolute(imagePath)
    ? imagePath
    : path.resolve(process.cwd(), imagePath);
  const extension = path.extname(resolvedPath).toLowerCase();

  if (!supportedImageExtensions.has(extension)) {
    throw new Error("UNSUPPORTED_SCREENSHOT_IMAGE_TYPE");
  }

  await access(resolvedPath, constants.R_OK);

  return resolvedPath;
}

export async function extractVisibleTextFromLocalScreenshot(input: {
  imagePath: string;
}): Promise<ExtractedScreenshot> {
  const resolvedPath = await validateLocalScreenshotImagePath(input.imagePath);
  const worker = await createWorker(localOcrLanguage);

  try {
    await worker.setParameters({
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: PSM.AUTO,
    });

    const result = await worker.recognize(resolvedPath);

    return extractedScreenshotSchema.parse({
      extractedText: normalizeExtractedText(result.data.text || ""),
      model: localOcrModel,
    });
  } finally {
    await worker.terminate();
  }
}

// This helper owns Tesseract worker lifecycle so the note worker only deals with
// chunk persistence and resumable job progress.
export async function runLocalScreenshotOcrTasks(
  tasks: LocalScreenshotOcrTask[],
): Promise<LocalScreenshotOcrSettledResult[]> {
  if (tasks.length === 0) {
    return [];
  }

  setLogging(false);

  const preparedTaskResults = await Promise.allSettled(
    tasks.map(async (task) => ({
      ...task,
      imagePath: await validateLocalScreenshotImagePath(task.imagePath),
    })),
  );
  const preparedTasks = preparedTaskResults
    .flatMap((result) => (result.status === "fulfilled" ? [result.value] : []))
    .slice();
  const earlyFailures = preparedTaskResults.flatMap((result, index) => {
    if (result.status === "fulfilled") {
      return [];
    }

    return [
      {
        chunkId: tasks[index].chunkId,
        status: "rejected" as const,
        error:
          result.reason instanceof Error
            ? result.reason.message
            : "Screenshot OCR failed.",
      },
    ];
  });

  if (preparedTasks.length === 0) {
    return earlyFailures;
  }

  const workerCount = Math.min(getOcrConcurrency(), preparedTasks.length);
  const scheduler = createScheduler();

  console.info(`${processingLogPrefix} local screenshot OCR starting`, {
    chunkCount: preparedTasks.length,
    workerCount,
    language: localOcrLanguage,
    model: localOcrModel,
  });

  try {
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        const worker = await createWorker(localOcrLanguage);

        await worker.setParameters({
          preserve_interword_spaces: "1",
          tessedit_pageseg_mode: PSM.AUTO,
        });

        scheduler.addWorker(worker);
      }),
    );

    const settledResults = await Promise.allSettled(
      preparedTasks.map(async (task) => {
        const result = await scheduler.addJob("recognize", task.imagePath);
        console.info("extracted text:"+result.data.text);
        return {
          chunkId: task.chunkId,
          extractedText: normalizeExtractedText(result.data.text || ""),
          model: localOcrModel,
          status: "fulfilled" as const,
        };

      }),
    );
    const resultByChunkId = new Map<string, LocalScreenshotOcrSettledResult>(
      earlyFailures.map((result) => [result.chunkId, result]),
    );

    for (const [index, settledResult] of settledResults.entries()) {
      const task = preparedTasks[index];

      if (settledResult.status === "fulfilled") {
        resultByChunkId.set(task.chunkId, settledResult.value);
        continue;
      }

      resultByChunkId.set(task.chunkId, {
        chunkId: task.chunkId,
        status: "rejected",
        error:
          settledResult.reason instanceof Error
            ? settledResult.reason.message
            : "Screenshot OCR failed.",
      });
    }
    const results = tasks.map(
      (task) =>
        resultByChunkId.get(task.chunkId) || {
          chunkId: task.chunkId,
          status: "rejected" as const,
          error: "Screenshot OCR failed.",
        },
    );

    console.info(`${processingLogPrefix} local screenshot OCR completed`, {
      chunkCount: preparedTasks.length,
      workerCount,
      model: localOcrModel,
    });

    return results;
  } finally {
    await scheduler.terminate();
  }
}
