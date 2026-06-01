import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function createNote(input: {
  projectId: string;
  sessionId: string;
  sourceId?: string | null;
  captureId?: string | null;
  noteText: string;
  userCommentary?: string | null;
}) {
  return db.note.create({
    data: {
      projectId: input.projectId,
      sessionId: input.sessionId,
      sourceId: input.sourceId || null,
      captureId: input.captureId || null,
      noteText: input.noteText,
      userCommentary: input.userCommentary || null,
    },
  });
}

export async function getNote(noteId: string) {
  return db.note.findUnique({ where: { id: noteId }, include: { source: true, capture: true } });
}

export async function listNotesBySession(sessionId: string) {
  return db.note.findMany({ where: { sessionId }, orderBy: { createdAt: "desc" } });
}

export async function listNotesBySource(sourceId: string) {
  return db.note.findMany({ where: { sourceId }, orderBy: { createdAt: "desc" } });
}

export async function listAllNotes() {
  return db.note.findMany({ orderBy: { createdAt: "desc" } });
}

export async function deleteNote(noteId: string) {
  return db.note.delete({ where: { id: noteId } });
}

export async function updateNoteSummary(noteId: string, summary: string, _embedding?: number[] | null) {
  return db.note.update({ where: { id: noteId }, data: { noteSummary: summary } });
}

export async function updateNotePinnaLayout(noteId: string, pinnaLayout: Record<string, unknown>) {
  return db.note.update({
    where: { id: noteId },
    data: { pinnaLayout: pinnaLayout as Prisma.InputJsonValue },
  });
}
