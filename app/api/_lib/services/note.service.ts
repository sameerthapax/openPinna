import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { enqueueNoteKnowledgeJobForNoteId } from "@/src/processing";
import { ensureNoteBaseKnowledgeHead } from "@/app/api/_lib/services/pinna-instance.service";

export type NoteProcessingState =
  | {
      state: "pending" | "processing";
      hasKnowledge: boolean;
      activeJobId: string;
      attempts: number;
      maxAttempts: number;
      updatedAt: Date | null;
      lastError: string | null;
    }
  | {
      state: "failed";
      hasKnowledge: boolean;
      activeJobId: null;
      attempts: number;
      maxAttempts: number;
      updatedAt: Date | null;
      lastError: string | null;
    }
  | {
      state: "ready" | "idle";
      hasKnowledge: boolean;
      activeJobId: null;
      attempts: number | null;
      maxAttempts: number | null;
      updatedAt: Date | null;
      lastError: string | null;
    };

export async function createNote(input: {
  projectId: string;
  sessionId: string;
  sourceId?: string | null;
  captureId?: string | null;
  voiceSessionId?: string | null;
  voiceAudioId?: string | null;
  noteText: string;
  userCommentary?: string | null;
}) {
  return db.$transaction(async (tx) => {
    const note = await tx.note.create({
      data: {
        projectId: input.projectId,
        sessionId: input.sessionId,
        sourceId: input.sourceId || null,
        captureId: input.captureId || null,
        voiceSessionId: input.voiceSessionId || null,
        voiceAudioId: input.voiceAudioId || null,
        noteText: input.noteText,
        userCommentary: input.userCommentary || null,
      },
    });

    await enqueueNoteKnowledgeJobForNoteId(note.id, tx);
    return note;
  });
}

export async function getNote(noteId: string) {
  await ensureNoteBaseKnowledgeHead(noteId);

  return db.note.findUnique({
    where: { id: noteId },
    include: {
      source: true,
      capture: true,
      voiceAudio: true,
      voiceSession: {
        include: {
          audio: true,
          screenshotSession: true,
        },
      },
      noteKnowledge: true,
      linkedNoteKnowledge: true,
      baseKnowledgeHead: {
        include: { currentVersion: true },
      },
    },
  });
}

export async function getNoteProcessingState(noteId: string): Promise<NoteProcessingState> {
  await ensureNoteBaseKnowledgeHead(noteId);

  const [note, activeJob, latestHistory] = await Promise.all([
    db.note.findUnique({
      where: { id: noteId },
      select: {
        linkedNoteKnowledge: { select: { id: true, updatedAt: true } },
        noteKnowledge: { select: { id: true, updatedAt: true } },
        baseKnowledgeHead: {
          select: {
            currentVersion: {
              select: { id: true, createdAt: true },
            },
          },
        },
      },
    }),
    db.processingJobOutbox.findFirst({
      where: { noteId, jobType: "process_note_knowledge_base" },
      orderBy: { updatedAt: "desc" },
    }),
    db.processingJobHistory.findFirst({
      where: { noteId, jobType: "process_note_knowledge_base" },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const knowledge =
    note?.baseKnowledgeHead?.currentVersion ||
    note?.linkedNoteKnowledge ||
    note?.noteKnowledge ||
    null;

  if (activeJob) {
    return {
      state: activeJob.status === "processing" ? "processing" : "pending",
      hasKnowledge: Boolean(knowledge),
      activeJobId: activeJob.id,
      attempts: activeJob.attempts,
      maxAttempts: activeJob.maxAttempts,
      updatedAt: activeJob.updatedAt,
      lastError: activeJob.lastError,
    };
  }

  if (latestHistory?.finalStatus === "failed" && !knowledge) {
    return {
      state: "failed",
      hasKnowledge: false,
      activeJobId: null,
      attempts: latestHistory.attempts,
      maxAttempts: latestHistory.maxAttempts,
      updatedAt: latestHistory.updatedAt,
      lastError: latestHistory.lastError,
    };
  }

  if (knowledge) {
    return {
      state: "ready",
      hasKnowledge: true,
      activeJobId: null,
      attempts: latestHistory?.attempts ?? null,
      maxAttempts: latestHistory?.maxAttempts ?? null,
      updatedAt:
        "updatedAt" in knowledge ? knowledge.updatedAt : knowledge.createdAt,
      lastError: latestHistory?.finalStatus === "failed" ? latestHistory.lastError : null,
    };
  }

  return {
    state: "idle",
    hasKnowledge: false,
    activeJobId: null,
    attempts: latestHistory?.attempts ?? null,
    maxAttempts: latestHistory?.maxAttempts ?? null,
    updatedAt: latestHistory?.updatedAt ?? null,
    lastError: latestHistory?.finalStatus === "failed" ? latestHistory.lastError : null,
  };
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

export async function updateNoteSourceCapture(
  noteId: string,
  input: {
    sourceId?: string | null;
    captureId?: string | null;
  },
) {
  return db.$transaction(async (tx) => {
    const note = await tx.note.update({
      where: { id: noteId },
      data: {
        sourceId: input.sourceId ?? undefined,
        captureId: input.captureId ?? undefined,
      },
    });

    await enqueueNoteKnowledgeJobForNoteId(note.id, tx);
    return note;
  });
}
