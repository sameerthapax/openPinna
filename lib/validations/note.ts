import { z } from "zod";

export const noteSchema = z.object({
  title: z.string().trim().min(1, "Add a title.").max(160),
  sourceUrl: z.string().trim().url("Add a valid source URL."),
  sourceTitle: z.string().trim().max(200).optional().or(z.literal("")),
  selectedText: z.string().trim().max(8000).optional().or(z.literal("")),
  rawThought: z.string().trim().min(1, "Add your research thought.").max(8000),
  tags: z.string().trim().max(300).optional().or(z.literal("")),
});

export type NoteFormValues = z.infer<typeof noteSchema>;

export function parseTags(tags: string | undefined) {
  if (!tags) {
    return [];
  }

  return tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
}
