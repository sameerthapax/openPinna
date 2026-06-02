import { z } from "zod";

export const processingLogPrefix = "[openPinna][processing]";

export const processingJobTypeSchema = z.enum(["process_note_knowledge_base"]);
export type ProcessingJobType = z.infer<typeof processingJobTypeSchema>;

export const processingJobPayloadSchema = z.object({
  sourceUrl: z.string().trim().nullable().optional(),
  pageTitle: z.string().trim().nullable().optional(),
  selectedText: z.string().nullable().optional(),
  userComment: z.string().nullable().optional(),
  hasAudio: z.boolean().default(false),
  hasScreenshots: z.boolean().default(false),
  screenshotId: z.string().uuid().nullable().optional(),
  audioId: z.string().uuid().nullable().optional(),
  captureIds: z.array(z.string().uuid()).default([]),
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

export const extractedScreenshotSchema = z.object({
  extractedText: z.string().trim().default(""),
  importantText: z.string().trim().default(""),
  model: z.string().trim().min(1),
});
export type ExtractedScreenshot = z.infer<typeof extractedScreenshotSchema>;

export const sourceMetadataSummarySchema = z.object({
  title: z.string().trim().nullable(),
  authors: z.array(z.string().trim()).default([]),
  publicationDate: z.string().trim().nullable(),
  abstract: z.string().trim().nullable(),
  summary: z.string().trim().nullable(),
  model: z.string().trim().min(1),
});
export type SourceMetadataSummary = z.infer<typeof sourceMetadataSummarySchema>;

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
