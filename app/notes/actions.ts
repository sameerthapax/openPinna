"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  createNoteSchema,
  createProjectSchema,
  createSessionSchema,
} from "@/app/api/research/research.schemas";
import {
  createNote,
  createProject,
  createSession,
} from "@/app/api/research/research.service";

export async function createProjectAction(formData: FormData) {
  const parsed = createProjectSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
  });

  if (!parsed.success) {
    return;
  }

  await createProject(parsed.data);
  revalidatePath("/notes");

  return;
}

export async function createSessionAction(projectId: string, formData: FormData) {
  const parsed = createSessionSchema.safeParse({
    title: formData.get("title"),
    sessionDate: formData.get("sessionDate"),
    summary: formData.get("summary"),
  });

  if (!parsed.success) {
    return;
  }

  await createSession(projectId, parsed.data);
  revalidatePath(`/notes/${projectId}`);
  revalidatePath("/notes");

  return;
}

export async function createSessionNoteAction(sessionId: string, formData: FormData) {
  const parsed = createNoteSchema.safeParse({
    sessionId,
    title: formData.get("title"),
    sourceUrl: formData.get("sourceUrl"),
    sourceTitle: formData.get("sourceTitle"),
    selectedText: formData.get("selectedText"),
    body: formData.get("body"),
    tags: formData.get("tags"),
    boardX: Number(formData.get("boardX") ?? 0),
    boardY: Number(formData.get("boardY") ?? 0),
  });

  if (!parsed.success) {
    return;
  }

  const session = await db.researchSession.findUnique({
    where: { id: sessionId },
    select: { id: true, projectId: true },
  });

  if (!session) {
    return;
  }

  await createNote(parsed.data);

  revalidatePath(`/notes/${session.projectId}/sessions/${session.id}`);
  revalidatePath(`/notes/${session.projectId}`);
  revalidatePath("/notes");

  return;
}
