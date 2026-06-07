import { createNoteSchema } from "@/app/api/_lib/validation";

export const noteSchema = createNoteSchema;

export type NoteFormValues = import("zod").infer<typeof noteSchema>;

export function parseTags() {
  return [];
}
