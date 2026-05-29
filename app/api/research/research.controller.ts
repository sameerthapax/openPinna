import { z } from "zod";
import {
  createMessageSchema,
  createNoteSchema,
  createProjectSchema,
  createSessionSchema,
  createThreadSchema,
  idParamSchema,
  patchNoteSchema,
} from "./research.schemas";
import {
  createMessage,
  createNote,
  createProject,
  createSession,
  createThread,
  deleteNote,
  getNoteById,
  getProjectCanvas,
  getSessionById,
  listNotes,
  listProjectsTree,
  patchNote,
} from "./research.service";

function jsonError(message: string, status = 400) {
  return Response.json({ ok: false, message }, { status });
}

function errorMessage(error: z.ZodError) {
  return error.errors[0]?.message ?? "Invalid request.";
}

async function parseBody(request: Request) {
  return request.json().catch(() => null);
}

export async function listProjectsController() {
  const projects = await listProjectsTree();
  return Response.json({ ok: true, projects });
}

export async function createProjectController(request: Request) {
  const payload = await parseBody(request);
  const parsed = createProjectSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(errorMessage(parsed.error));
  }

  const project = await createProject(parsed.data);
  return Response.json({ ok: true, project }, { status: 201 });
}

export async function getProjectController(id: string) {
  const parsed = idParamSchema.safeParse({ id });
  if (!parsed.success) {
    return jsonError(errorMessage(parsed.error));
  }

  const project = await getProjectCanvas(parsed.data.id);
  if (!project) {
    return jsonError("Project not found.", 404);
  }

  return Response.json({ ok: true, project });
}

export async function createSessionController(request: Request, id: string) {
  const idParsed = idParamSchema.safeParse({ id });
  if (!idParsed.success) {
    return jsonError(errorMessage(idParsed.error));
  }

  const payload = await parseBody(request);
  const parsed = createSessionSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(errorMessage(parsed.error));
  }

  const session = await createSession(idParsed.data.id, parsed.data);
  return Response.json({ ok: true, session }, { status: 201 });
}

export async function getSessionController(id: string) {
  const parsed = idParamSchema.safeParse({ id });
  if (!parsed.success) {
    return jsonError(errorMessage(parsed.error));
  }

  const session = await getSessionById(parsed.data.id);
  if (!session) {
    return jsonError("Session not found.", 404);
  }

  return Response.json({ ok: true, session });
}

export async function listNotesController() {
  const notes = await listNotes();
  return Response.json({ ok: true, notes });
}

export async function createNoteController(request: Request) {
  const payload = await parseBody(request);
  const parsed = createNoteSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(errorMessage(parsed.error));
  }

  const note = await createNote(parsed.data);
  return Response.json({ ok: true, note }, { status: 201 });
}

export async function getNoteController(id: string) {
  const parsed = idParamSchema.safeParse({ id });
  if (!parsed.success) {
    return jsonError(errorMessage(parsed.error));
  }

  const note = await getNoteById(parsed.data.id);
  if (!note) {
    return jsonError("Note not found.", 404);
  }

  return Response.json({ ok: true, note });
}

export async function patchNoteController(request: Request, id: string) {
  const idParsed = idParamSchema.safeParse({ id });
  if (!idParsed.success) {
    return jsonError(errorMessage(idParsed.error));
  }

  const payload = await parseBody(request);
  const parsed = patchNoteSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(errorMessage(parsed.error));
  }

  try {
    const note = await patchNote(idParsed.data.id, parsed.data);
    return Response.json({ ok: true, note });
  } catch {
    return jsonError("Note not found.", 404);
  }
}

export async function deleteNoteController(id: string) {
  const parsed = idParamSchema.safeParse({ id });
  if (!parsed.success) {
    return jsonError(errorMessage(parsed.error));
  }

  try {
    await deleteNote(parsed.data.id);
    return Response.json({ ok: true, deleted: true });
  } catch {
    return jsonError("Note not found.", 404);
  }
}

export async function createThreadController(request: Request) {
  const payload = await parseBody(request);
  const parsed = createThreadSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(errorMessage(parsed.error));
  }

  try {
    const thread = await createThread(parsed.data);
    return Response.json({ ok: true, thread }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Invalid scope.");
  }
}

export async function createMessageController(request: Request) {
  const payload = await parseBody(request);
  const parsed = createMessageSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(errorMessage(parsed.error));
  }

  const message = await createMessage(parsed.data);
  return Response.json({ ok: true, message }, { status: 201 });
}
