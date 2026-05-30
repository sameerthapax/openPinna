import { db } from "@/lib/db";
import { summarizeText, maybeEmbed } from "@/app/api/_lib/ai";
import { updateNoteSummary } from "@/app/api/_lib/services/note.service";
import { updateProjectSummary } from "@/app/api/_lib/services/project.service";
import { updateSessionSummary } from "@/app/api/_lib/services/session.service";

export async function createKnowledgeEvent(input: {
  projectId: string;
  sessionId: string;
  noteId?: string | null;
  threadId?: string | null;
  eventType: string;
  content: string;
  importanceScore?: number;
  confidenceScore?: number;
}) {
  return db.knowledgeEvent.create({
    data: {
      ...input,
      importanceScore: input.importanceScore ?? 0,
      confidenceScore: input.confidenceScore ?? 0,
    },
  });
}

export async function acceptKnowledgeEvent(eventId: string) {
  return db.knowledgeEvent.update({ where: { id: eventId }, data: { status: "accepted" } });
}
export async function rejectKnowledgeEvent(eventId: string) {
  return db.knowledgeEvent.update({ where: { id: eventId }, data: { status: "rejected" } });
}
export async function promoteKnowledgeEvent(eventId: string) {
  return db.knowledgeEvent.update({ where: { id: eventId }, data: { status: "promoted" } });
}

export async function rebuildSessionSummary(sessionId: string) {
  const notes = await db.note.findMany({
    where: { sessionId },
    include: { chatThreads: true },
  });
  const parts = notes.flatMap((n) => [n.noteSummary || n.noteText, ...n.chatThreads.map((t) => t.summary || "")]);
  const summary = await summarizeText(parts, "Session");
  const embedding = await maybeEmbed(summary);
  await updateSessionSummary(sessionId, summary, embedding);
  return summary;
}

export async function rebuildProjectSummary(projectId: string) {
  const sessions = await db.session.findMany({ where: { projectId } });
  const summary = await summarizeText(
    sessions.map((s) => s.sessionSummary || ""),
    "Project",
  );
  const embedding = await maybeEmbed(summary);
  await updateProjectSummary(projectId, summary, embedding);
  return summary;
}

export async function rebuildNoteSummary(noteId: string) {
  const note = await db.note.findUnique({ where: { id: noteId }, include: { chatThreads: true } });
  if (!note) return null;
  const summary = await summarizeText(
    [note.noteText, ...note.chatThreads.map((t) => t.summary || "")],
    "Note",
  );
  const embedding = await maybeEmbed(summary);
  await updateNoteSummary(note.id, summary, embedding);
  return { summary, note };
}
