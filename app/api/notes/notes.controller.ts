import { z } from "zod";
import {
  createNoteRequestSchema,
  noteIdSchema,
  updateNoteRequestSchema,
} from "./notes.schemas";
import {
  createNote,
  deleteNote,
  getNoteById,
  listNotes,
  updateNote,
} from "./notes.service";

function jsonError(message: string, status = 400) {
  return Response.json({ ok: false, message }, { status });
}

function toValidationMessage(error: z.ZodError) {
  return error.errors[0]?.message ?? "Invalid request.";
}

export async function listNotesController() {
  const notes = await listNotes();
  return Response.json({ ok: true, notes });
}

export async function createNoteController(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = createNoteRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return jsonError(toValidationMessage(parsed.error));
  }

  const note = await createNote(parsed.data);

  return Response.json({ ok: true, note }, { status: 201 });
}

export async function getNoteController(_request: Request, id: string) {
  const parsed = noteIdSchema.safeParse({ id });

  if (!parsed.success) {
    return jsonError(toValidationMessage(parsed.error));
  }

  const note = await getNoteById(parsed.data.id);

  if (!note) {
    return jsonError("Note not found.", 404);
  }

  return Response.json({ ok: true, note });
}

export async function updateNoteController(request: Request, id: string) {
  const idParsed = noteIdSchema.safeParse({ id });

  if (!idParsed.success) {
    return jsonError(toValidationMessage(idParsed.error));
  }

  const payload = await request.json().catch(() => null);
  const parsed = updateNoteRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return jsonError(toValidationMessage(parsed.error));
  }

  const note = await updateNote(idParsed.data.id, parsed.data);

  if (!note) {
    return jsonError("Note not found.", 404);
  }

  return Response.json({ ok: true, note });
}

export async function deleteNoteController(_request: Request, id: string) {
  const parsed = noteIdSchema.safeParse({ id });

  if (!parsed.success) {
    return jsonError(toValidationMessage(parsed.error));
  }

  const deleted = await deleteNote(parsed.data.id);

  if (!deleted) {
    return jsonError("Note not found.", 404);
  }

  return Response.json({ ok: true, deleted: true });
}
