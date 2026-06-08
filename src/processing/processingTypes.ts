import { z } from "zod";

export const processingLogPrefix = "[openPinna][processing]";

export const processingJobTypeSchema = z.enum(["process_note_knowledge_base"]);
export type ProcessingJobType = z.infer<typeof processingJobTypeSchema>;

export const noteProcessingStepSchema = z.enum([
  "retrieval",
  "screenshot_ocr",
  "screenshot_finalize_info",
  "knowledge_upsert",
]);
export type NoteProcessingStep = z.infer<typeof noteProcessingStepSchema>;

const screenshotChunkSnapshotSchema = z.object({
  id: z.string().uuid(),
  chunkIndex: z.number().int().nonnegative(),
  filePath: z.string().trim(),
  pageUrl: z.string().trim().nullable(),
  pageTitle: z.string().trim().nullable(),
});

const retrievalSnapshotSchema = z.object({
  noteId: z.string().uuid(),
  sourceId: z.string().uuid().nullable(),
  captureId: z.string().uuid().nullable(),
  voiceSessionId: z.string().uuid().nullable(),
  voiceAudioId: z.string().uuid().nullable(),
  screenshotSessionId: z.string().uuid().nullable(),
  sourceUrl: z.string().trim().nullable(),
  sourceTitle: z.string().trim().nullable(),
  selectedText: z.string().nullable(),
  userCommentary: z.string().nullable(),
  transcriptText: z.string().nullable(),
  orderedScreenshotChunks: z.array(screenshotChunkSnapshotSchema).default([]),
  selectedScreenshotChunks: z.array(screenshotChunkSnapshotSchema).default([]),
});

export const processingJobPayloadSchema = z.object({
  sourceUrl: z.string().trim().nullable().optional(),
  pageTitle: z.string().trim().nullable().optional(),
  selectedText: z.string().nullable().optional(),
  userComment: z.string().nullable().optional(),
  captureOrigin: z.string().trim().nullable().optional(),
  hasAudio: z.boolean().default(false),
  hasScreenshots: z.boolean().default(false),
  screenshotId: z.string().uuid().nullable().optional(),
  audioId: z.string().uuid().nullable().optional(),
  captureIds: z.array(z.string().uuid()).default([]),
  directScreenshotText: z.string().trim().nullable().optional(),
  directScreenshotOcrModel: z.string().trim().nullable().optional(),
  directScreenshotSummary: z.string().trim().nullable().optional(),
  currentStep: noteProcessingStepSchema.default("retrieval"),
  selectedScreenshotChunkIds: z.array(z.string().uuid()).default([]),
  selectedScreenshotChunkCount: z.number().int().nonnegative().default(0),
  lastProcessedChunkIndex: z.number().int().nonnegative().nullable().optional(),
  retrievalSnapshot: retrievalSnapshotSchema.nullable().optional(),
});
export type ProcessingJobPayload = z.infer<typeof processingJobPayloadSchema>;

export const processingJobRecordSchema = z.object({
  id: z.string().uuid(),
  jobType: processingJobTypeSchema,
  status: z.string(),
  projectId: z.string().uuid().nullable(),
  sessionId: z.string().uuid().nullable(),
  noteId: z.string().uuid().nullable(),
  sourceId: z.string().uuid().nullable(),
  voiceSessionId: z.string().uuid().nullable(),
  audioId: z.string().uuid().nullable(),
  screenshotId: z.string().uuid().nullable(),
  captureId: z.string().uuid().nullable(),
  payload: processingJobPayloadSchema,
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  runAfter: z.date(),
  lockedAt: z.date().nullable(),
  lockedBy: z.string().nullable(),
  lastError: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type ProcessingJobRecord = z.infer<typeof processingJobRecordSchema>;

export class DeferredProcessingError extends Error {
  runAfter: Date;
  consumeAttempt: boolean;

  constructor(message: string, runAfter?: Date, consumeAttempt = false) {
    super(message);
    this.name = "DeferredProcessingError";
    this.runAfter = runAfter ?? new Date(Date.now() + 60 * 1000);
    this.consumeAttempt = consumeAttempt;
  }
}

export const extractedScreenshotSchema = z.object({
  extractedText: z.string().trim().default(""),
  model: z.string().trim().min(1),
});
export type ExtractedScreenshot = z.infer<typeof extractedScreenshotSchema>;

export const groundedSourceSummarySchema = z.object({
  summary: z.string().trim().nullable(),
  model: z.string().trim().min(1),
});
export type GroundedSourceSummary = z.infer<
  typeof groundedSourceSummarySchema
>;

export const screenshotFieldExtractionSchema = z.object({
  selectedText: z.string().trim().nullable(),
  title: z.string().trim().nullable(),
  url: z.string().trim().nullable(),
  authors: z.array(z.string().trim()).default([]),
  abstract: z.string().trim().nullable(),
  publicationDate: z.string().trim().nullable(),
  model: z.string().trim().min(1),
});
export type ScreenshotFieldExtraction = z.infer<
  typeof screenshotFieldExtractionSchema
>;

export const clickyScreenshotExtractionSchema = z.object({
  extractedText: z.string().trim().default(""),
  selectedText: z.string().trim().nullable(),
  title: z.string().trim().nullable(),
  url: z.string().trim().nullable(),
  authors: z.array(z.string().trim()).default([]),
  abstract: z.string().trim().nullable(),
  publicationDate: z.string().trim().nullable(),
  model: z.string().trim().min(1),
});
export type ClickyScreenshotExtraction = z.infer<
  typeof clickyScreenshotExtractionSchema
>;

export const noteKnowledgeSectionsSchema = z.object({
  keyFindings: z.string().trim().min(1),
  userView: z.string().trim().min(1),
  conclusion: z.string().trim().min(1),
  model: z.string().trim().min(1),
});
export type NoteKnowledgeSections = z.infer<typeof noteKnowledgeSectionsSchema>;

export type EnqueueProcessingJobInput = {
  jobType: ProcessingJobType;
  projectId?: string | null;
  sessionId?: string | null;
  noteId?: string | null;
  sourceId?: string | null;
  voiceSessionId?: string | null;
  audioId?: string | null;
  screenshotId?: string | null;
  captureId?: string | null;
  payload: ProcessingJobPayload;
  maxAttempts?: number;
  runAfter?: Date;
};
