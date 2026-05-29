import { createNoteSchema } from "@/app/api/research/research.schemas";

export const noteSchema = createNoteSchema;

export type NoteFormValues = typeof noteSchema._type;

export function parseTags(tags?: string | string[]) {
  if (!tags) {
    return [];
  }

  const values = Array.isArray(tags) ? tags : tags.split(",");
  return values.map((tag) => tag.trim()).filter(Boolean);
}
