import {
  ResearchMessageRole,
  ResearchScopeType,
  type Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import type {
  CreateMessageInput,
  CreateNoteInput,
  CreateProjectInput,
  CreateSessionInput,
  CreateThreadInput,
  PatchNoteInput,
} from "./research.schemas";

function normalizeTags(tags?: string[] | string) {
  if (!tags) {
    return [];
  }

  const values = Array.isArray(tags) ? tags : tags.split(",");
  return values
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function optionalValue(value?: string) {
  const next = value?.trim();
  return next ? next : null;
}

export async function listProjectsTree() {
  const projects = await db.project.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      sessions: {
        orderBy: { sessionDate: "asc" },
        include: {
          notes: {
            orderBy: { capturedAt: "asc" },
            select: { id: true, title: true },
          },
        },
      },
    },
  });

  return projects.map((project) => ({
    ...project,
    sessionCount: project.sessions.length,
  }));
}

export async function createProject(input: CreateProjectInput) {
  return db.project.create({
    data: {
      title: input.title.trim(),
      description: optionalValue(input.description),
    },
  });
}

export async function getProjectCanvas(projectId: string) {
  return db.project.findUnique({
    where: { id: projectId },
    include: {
      threads: {
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      sessions: {
        orderBy: { sessionDate: "asc" },
        include: {
          notes: {
            orderBy: { capturedAt: "asc" },
            include: {
              threads: {
                include: {
                  messages: {
                    orderBy: { createdAt: "asc" },
                  },
                },
                orderBy: { createdAt: "asc" },
              },
            },
          },
          threads: {
            include: {
              messages: {
                orderBy: { createdAt: "asc" },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });
}

export async function createSession(projectId: string, input: CreateSessionInput) {
  return db.researchSession.create({
    data: {
      projectId,
      title: input.title.trim(),
      sessionDate: input.sessionDate,
      summary: optionalValue(input.summary),
    },
  });
}

export async function getSessionById(sessionId: string) {
  return db.researchSession.findUnique({
    where: { id: sessionId },
    include: {
      project: true,
      notes: {
        orderBy: { capturedAt: "asc" },
      },
      threads: {
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function createNote(input: CreateNoteInput) {
  return db.sessionNote.create({
    data: {
      sessionId: input.sessionId,
      title: input.title.trim(),
      sourceUrl: optionalValue(input.sourceUrl),
      sourceTitle: optionalValue(input.sourceTitle),
      selectedText: optionalValue(input.selectedText),
      body: input.body.trim(),
      tags: normalizeTags(input.tags),
      boardX: input.boardX ?? 0,
      boardY: input.boardY ?? 0,
      capturedAt: input.capturedAt ?? new Date(),
    },
  });
}

export async function listNotes() {
  return db.sessionNote.findMany({
    orderBy: { capturedAt: "desc" },
    include: {
      session: {
        include: {
          project: true,
        },
      },
    },
  });
}

export async function getNoteById(noteId: string) {
  return db.sessionNote.findUnique({
    where: { id: noteId },
    include: {
      session: {
        include: {
          project: true,
        },
      },
      threads: {
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function patchNote(noteId: string, input: PatchNoteInput) {
  const data: Prisma.SessionNoteUpdateInput = {};

  if (input.title !== undefined) {
    data.title = input.title.trim();
  }
  if (input.sourceUrl !== undefined) {
    data.sourceUrl = optionalValue(input.sourceUrl);
  }
  if (input.sourceTitle !== undefined) {
    data.sourceTitle = optionalValue(input.sourceTitle);
  }
  if (input.selectedText !== undefined) {
    data.selectedText = optionalValue(input.selectedText);
  }
  if (input.body !== undefined) {
    data.body = input.body.trim();
  }
  if (input.tags !== undefined) {
    data.tags = normalizeTags(input.tags);
  }
  if (input.boardX !== undefined) {
    data.boardX = input.boardX;
  }
  if (input.boardY !== undefined) {
    data.boardY = input.boardY;
  }
  if (input.capturedAt !== undefined) {
    data.capturedAt = input.capturedAt;
  }

  return db.sessionNote.update({
    where: { id: noteId },
    data,
  });
}

export async function deleteNote(noteId: string) {
  return db.sessionNote.delete({
    where: { id: noteId },
  });
}

export async function createThread(input: CreateThreadInput) {
  const scopeBindings: Record<ResearchScopeType, string[]> = {
    PROJECT: ["projectId"],
    SESSION: ["projectId", "sessionId"],
    NOTE: ["projectId", "sessionId", "noteId"],
  };
  const required = scopeBindings[input.scopeType];
  for (const key of required) {
    if (!input[key as keyof CreateThreadInput]) {
      throw new Error(`Missing required scope field: ${key}`);
    }
  }

  return db.researchThread.create({
    data: {
      scopeType: input.scopeType,
      topicType: input.topicType,
      title: input.title.trim(),
      projectId: input.projectId,
      sessionId: input.sessionId,
      noteId: input.noteId,
    },
  });
}

export async function createMessage(input: CreateMessageInput) {
  return db.researchMessage.create({
    data: {
      threadId: input.threadId,
      role: input.role ?? ResearchMessageRole.USER,
      content: input.content.trim(),
    },
  });
}
