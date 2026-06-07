import { z } from "zod";
import { captureArtifactTypes, captureModes } from "@/app/api/_lib/services/capture.service";

export const uuidSchema = z.string().uuid();

export const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().optional().nullable(),
  userId: uuidSchema.optional().nullable(),
});

export const createSourceUrlSchema = z.object({
  sourceType: z.string().trim().default("paper"),
  title: z.string().trim().optional().nullable(),
  abstract: z.string().trim().optional().nullable(),
  authors: z.array(z.string()).optional(),
  publicationYear: z.number().int().optional().nullable(),
  publicationDate: z.string().date().optional().nullable(),
  venue: z.string().trim().optional().nullable(),
  doi: z.string().trim().optional().nullable(),
  url: z.string().trim().url().optional().nullable(),
  pdfUrl: z.string().trim().url().optional().nullable(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const createCaptureSchema = z.object({
  sessionId: uuidSchema,
  artifactType: z.enum(captureArtifactTypes).optional().nullable(),
  captureMode: z.enum(captureModes).optional().nullable(),
  mimeType: z.string().trim().optional().nullable(),
  originalUrl: z.string().trim().url().optional().nullable(),
  title: z.string().trim().optional().nullable(),
  fileName: z.string().trim().optional().nullable(),
  source: z.string().trim().optional().nullable(),
  selectedText: z.string().optional().nullable(),
  surroundingText: z.string().optional().nullable(),
  pageNumber: z.coerce.number().int().optional().nullable(),
  xPosition: z.coerce.number().optional().nullable(),
  yPosition: z.coerce.number().optional().nullable(),
  caption: z.string().optional().nullable(),
});

export const createScreenshotCaptureSchema = z.object({
  selectedText: z.string().optional().nullable(),
  caption: z.string().optional().nullable(),
});

export const createNoteSchema = z.object({
  sourceId: uuidSchema.optional().nullable(),
  captureId: uuidSchema.optional().nullable(),
  voiceSessionId: uuidSchema.optional().nullable(),
  voiceAudioId: uuidSchema.optional().nullable(),
  noteText: z.string().trim().min(1),
  userCommentary: z.string().trim().optional().nullable(),
});

export const createVoiceSessionSchema = z.object({
  projectId: uuidSchema.optional().nullable(),
  pinnaId: z.string().trim().optional().nullable(),
  sourceJson: z.unknown().optional().nullable(),
  selectedText: z.string().trim().optional().nullable(),
  pageUrl: z.string().trim().url().optional().nullable(),
  pageTitle: z.string().trim().optional().nullable(),
  startedAt: z.string().datetime().optional().nullable(),
});

export const updateVoiceSessionSchema = z.object({
  sourceJson: z.record(z.string(), z.unknown()).optional(),
});

export const createVoiceScreenshotSessionSchema = z.object({
  audioId: uuidSchema.optional().nullable(),
  projectId: uuidSchema.optional().nullable(),
  pinnaId: z.string().trim().optional().nullable(),
  pageUrl: z.string().trim().url().optional().nullable(),
  pageTitle: z.string().trim().optional().nullable(),
  sourceJson: z.unknown().optional().nullable(),
  selectedText: z.string().trim().optional().nullable(),
  documentHeight: z.coerce.number().int().min(0).optional().nullable(),
  viewportWidth: z.coerce.number().int().min(0).optional().nullable(),
  viewportHeight: z.coerce.number().int().min(0).optional().nullable(),
  devicePixelRatio: z.coerce.number().min(0).optional().nullable(),
});

export const voiceChunkAllowedMimeTypes = [
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/mp4",
] as const;

export const voiceChunkMetadataSchema = z.object({
  audioId: uuidSchema,
  chunkId: z.string().uuid(),
  chunkIndex: z.coerce.number().int().min(0),
  mimeType: z.enum(voiceChunkAllowedMimeTypes),
  sourceJson: z.string().optional().nullable(),
  selectedText: z.string().optional().nullable(),
  projectId: uuidSchema.optional().nullable(),
  pinnaId: z.string().trim().optional().nullable(),
  pageUrl: z.string().trim().url().optional().nullable(),
  pageTitle: z.string().trim().optional().nullable(),
  startedAt: z.string().datetime().optional().nullable(),
});

export const voiceScreenshotChunkAllowedMimeTypes = ["image/png"] as const;

export const voiceScreenshotChunkMetadataSchema = z.object({
  screenshotId: uuidSchema,
  voiceSessionId: uuidSchema,
  audioId: uuidSchema.optional().nullable(),
  chunkId: z.string().uuid(),
  chunkIndex: z.coerce.number().int().min(0),
  pageUrl: z.string().trim().url().optional().nullable(),
  pageTitle: z.string().trim().optional().nullable(),
  scrollY: z.coerce.number().int().min(0),
  viewportWidth: z.coerce.number().int().min(0),
  viewportHeight: z.coerce.number().int().min(0),
  documentHeight: z.coerce.number().int().min(0),
  devicePixelRatio: z.coerce.number().min(0),
  capturedAt: z.string().datetime(),
  projectId: uuidSchema.optional().nullable(),
  pinnaId: z.string().trim().optional().nullable(),
  sourceJson: z.string().optional().nullable(),
  selectedText: z.string().optional().nullable(),
});

export const createThreadSchema = z.object({
  pinnaTemplateKey: z.string().trim().min(1).optional(),
  threadType: z.string().trim().min(1).optional(),
  baseSelection: z.enum(["current", "first"]).optional().default("current"),
  title: z.string().trim().optional().nullable(),
  customInstructions: z.string().trim().optional().nullable(),
}).refine((value) => Boolean(value.pinnaTemplateKey || value.threadType), {
  message: "pinnaTemplateKey is required.",
});

export const sendMessageSchema = z.object({
  userMessage: z.string().trim().min(1),
});

export const createThreadRunSchema = sendMessageSchema.extend({
  stream: z.boolean().optional().default(false),
});

export const createThreadKnowledgeEventSchema = z.object({
  eventType: z.string().trim().min(1),
  actor: z.string().trim().optional(),
  messageRef: z.string().trim().optional(),
  payload: z.record(z.string(), z.any()).optional(),
  content: z.string().trim().optional(),
  importanceScore: z.number().optional(),
  confidenceScore: z.number().optional(),
  supersedesEventId: uuidSchema.optional(),
});

export const updateNotePinnaLayoutSchema = z.object({
  pinnaLayout: z.object({
    zoom: z.number().min(0.1).max(3),
    nodes: z.array(
      z.object({
        id: uuidSchema,
        x: z.number(),
        y: z.number(),
      }),
    ),
  }),
});
