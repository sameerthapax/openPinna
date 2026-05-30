"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { createProjectSchema, createNoteSchema } from "@/app/api/_lib/validation";
import { createProject } from "@/app/api/_lib/services/project.service";
import { getOrCreateTodaySession } from "@/app/api/_lib/services/session.service";
import { createNote } from "@/app/api/_lib/services/note.service";

export async function createProjectAction(formData: FormData) {
  const parsed = createProjectSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
  });
  if (!parsed.success) return;

  await createProject(parsed.data);
  revalidatePath("/notes");
}

export async function createSessionAction(projectId: string) {
  await getOrCreateTodaySession(projectId);
  revalidatePath(`/notes/${projectId}`);
  revalidatePath("/notes");
}

export async function createSessionNoteAction(sessionId: string, formData: FormData) {
  const parsed = createNoteSchema.safeParse({
    noteText: formData.get("body") || formData.get("noteText"),
    sourceId: formData.get("sourceId"),
    captureId: formData.get("captureId"),
    userCommentary: formData.get("userCommentary"),
  });
  if (!parsed.success) return;

  const session = await db.session.findUnique({ where: { id: sessionId }, select: { id: true, projectId: true } });
  if (!session) return;

  await createNote({ projectId: session.projectId, sessionId, ...parsed.data });

  revalidatePath(`/notes/${session.projectId}/sessions/${session.id}`);
  revalidatePath(`/notes/${session.projectId}`);
  revalidatePath("/notes");
}
