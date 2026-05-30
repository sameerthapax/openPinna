import { z } from "zod";

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
  metadata: z.record(z.any()).optional(),
});

export const createCaptureSchema = z.object({
  sessionId: uuidSchema,
  selectedText: z.string().optional().nullable(),
  surroundingText: z.string().optional().nullable(),
  pageNumber: z.coerce.number().int().optional().nullable(),
  xPosition: z.coerce.number().optional().nullable(),
  yPosition: z.coerce.number().optional().nullable(),
  caption: z.string().optional().nullable(),
});

export const createNoteSchema = z.object({
  sourceId: uuidSchema.optional().nullable(),
  captureId: uuidSchema.optional().nullable(),
  noteText: z.string().trim().min(1),
  userCommentary: z.string().trim().optional().nullable(),
});

export const createThreadSchema = z.object({
  pinnaTemplateKey: z.string().trim().min(1).optional(),
  threadType: z.string().trim().min(1).optional(),
  title: z.string().trim().optional().nullable(),
  customInstructions: z.string().trim().optional().nullable(),
}).refine((value) => Boolean(value.pinnaTemplateKey || value.threadType), {
  message: "pinnaTemplateKey is required.",
});

export const sendMessageSchema = z.object({
  userMessage: z.string().trim().min(1),
});
