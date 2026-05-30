import { deleteNote, getNote } from "@/app/api/_lib/services/note.service";
import { jsonError, jsonOk } from "@/app/api/_lib/http";

type Ctx = { params: Promise<{ noteId: string }> };

export async function GET(_request: Request, context: Ctx) {
  const { noteId } = await context.params;
  const note = await getNote(noteId);
  if (!note) return jsonError("Note not found.", 404);
  return jsonOk({ note });
}

export async function DELETE(_request: Request, context: Ctx) {
  const { noteId } = await context.params;
  try {
    await deleteNote(noteId);
    return jsonOk({ deleted: true });
  } catch {
    return jsonError("Note not found.", 404);
  }
}
