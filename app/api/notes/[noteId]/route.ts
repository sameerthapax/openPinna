import { deleteNote, getNote, updateNotePinnaLayout } from "@/app/api/_lib/services/note.service";
import { updateNotePinnaLayoutSchema } from "@/app/api/_lib/validation";
import { jsonError, jsonOk, parseJson, zodError } from "@/app/api/_lib/http";

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

export async function PATCH(request: Request, context: Ctx) {
  const { noteId } = await context.params;
  const payload = await parseJson(request);
  const parsed = updateNotePinnaLayoutSchema.safeParse(payload);
  if (!parsed.success) return jsonError(zodError(parsed.error));

  try {
    const note = await updateNotePinnaLayout(noteId, parsed.data.pinnaLayout);
    return jsonOk({ note });
  } catch {
    return jsonError("Note not found.", 404);
  }
}
