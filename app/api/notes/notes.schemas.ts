import { z } from "zod";

const tagsSchema = z.union([z.array(z.string()), z.string()]).optional();

export const noteIdSchema = z.object({
  id: z.string().min(1, "Note id is required."),
});

export const createNoteRequestSchema = z.object({
  title: z.string().trim().min(1, "Add a title.").max(160),
  sourceUrl: z.string().trim().url("Add a valid source URL."),
  sourceTitle: z.string().trim().max(200).optional().or(z.literal("")),
  selectedText: z.string().trim().max(8000).optional().or(z.literal("")),
  rawThought: z.string().trim().min(1, "Add your research thought.").max(8000),
  tags: tagsSchema,
});

export const updateNoteRequestSchema = createNoteRequestSchema
  .partial()
  .extend({
    title: z.string().trim().min(1).max(160).optional(),
    sourceUrl: z.string().trim().url().optional(),
    sourceTitle: z.string().trim().max(200).optional().or(z.literal("")),
    selectedText: z.string().trim().max(8000).optional().or(z.literal("")),
    rawThought: z.string().trim().min(1).max(8000).optional(),
    tags: tagsSchema,
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update.",
  });

export type CreateNoteRequest = z.infer<typeof createNoteRequestSchema>;
export type UpdateNoteRequest = z.infer<typeof updateNoteRequestSchema>;
