import { createNoteSchema } from "@/app/api/_lib/validation";

export const noteSchema = createNoteSchema;

export type NoteFormValues = typeof noteSchema._type;

export function parseTags(_tags?: string | string[]) {
  return [];
}
