import { ResearchMessageRole, ResearchScopeType, ResearchTopicType } from "@prisma/client";
import { z } from "zod";

const optionalText = z.string().trim().max(8000).optional().or(z.literal(""));

export const idParamSchema = z.object({
  id: z.string().min(1, "Id is required."),
});

export const createProjectSchema = z.object({
  title: z.string().trim().min(1, "Project title is required.").max(180),
  description: optionalText,
});

export const createSessionSchema = z.object({
  title: z.string().trim().min(1, "Session title is required.").max(180),
  sessionDate: z.coerce.date(),
  summary: optionalText,
});

export const createNoteSchema = z.object({
  sessionId: z.string().min(1, "Session id is required."),
  title: z.string().trim().min(1, "Note title is required.").max(200),
  sourceUrl: z.string().trim().url().optional().or(z.literal("")),
  sourceTitle: z.string().trim().max(220).optional().or(z.literal("")),
  selectedText: optionalText,
  body: z.string().trim().min(1, "Note body is required.").max(16000),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
  boardX: z.number().finite().optional(),
  boardY: z.number().finite().optional(),
  capturedAt: z.coerce.date().optional(),
});

export const patchNoteSchema = createNoteSchema
  .omit({ sessionId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });

export const createThreadSchema = z.object({
  scopeType: z.nativeEnum(ResearchScopeType),
  topicType: z.nativeEnum(ResearchTopicType),
  title: z.string().trim().min(1).max(200),
  projectId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  noteId: z.string().min(1).optional(),
});

export const createMessageSchema = z.object({
  threadId: z.string().min(1),
  role: z.nativeEnum(ResearchMessageRole).optional(),
  content: z.string().trim().min(1).max(16000),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type PatchNoteInput = z.infer<typeof patchNoteSchema>;
export type CreateThreadInput = z.infer<typeof createThreadSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
