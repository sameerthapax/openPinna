"use server";

import { revalidatePath } from "next/cache";
import {
  noteSchema,
  parseTags,
  type NoteFormValues,
} from "@/lib/validations/note";
import { createNote } from "@/app/api/notes/notes.service";

export type CreateNoteResult =
  | { ok: true; noteId: string }
  | { ok: false; message: string };

export async function createNoteAction(
  values: NoteFormValues,
): Promise<CreateNoteResult> {
  const parsed = noteSchema.safeParse(values);

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.errors[0]?.message ?? "Invalid note data.",
    };
  }

  const note = await createNote({
    title: parsed.data.title,
    sourceUrl: parsed.data.sourceUrl,
    sourceTitle: parsed.data.sourceTitle || null,
    selectedText: parsed.data.selectedText || null,
    rawThought: parsed.data.rawThought,
    tags: parseTags(parsed.data.tags),
  });

  revalidatePath("/notes");

  return { ok: true, noteId: note.id };
}
