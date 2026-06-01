import { createNote } from "@/app/api/_lib/services/note.service";
import { getOrCreateTodaySession } from "@/app/api/_lib/services/session.service";
import { createSourceFromUrl } from "@/app/api/_lib/services/source.service";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { combineAudioChunks } from "./voice-combine.service";
import { toVoiceRelativePath, writeVoiceChunkFile } from "./voice-storage.service";
import { transcribeAudioFile } from "./voice-transcription.service";

function asJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value as Prisma.InputJsonValue;
}

function parseSourceJson(value: unknown) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return { raw: value };
    }
  }

  if (typeof value === "object") {
    return value as Record<string, unknown>;
  }

  return { raw: value };
}

function buildFinalTranscript(chunks: Array<{ chunkIndex: number; transcript: string | null; transcriptionStatus: string }>) {
  return chunks
    .map((chunk) => {
      if (chunk.transcriptionStatus === "transcribed") {
        return (chunk.transcript || "").trim();
      }

      if (chunk.transcriptionStatus === "transcription_failed") {
        return `[Chunk ${chunk.chunkIndex + 1} transcription failed]`;
      }

      return "";
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

// Voice sessions keep chunk state durable before transcription so finalize can recover partial failures.
export async function createVoiceSession(input: {
  projectId?: string | null;
  pinnaId?: string | null;
  sourceJson?: unknown;
  selectedText?: string | null;
  pageUrl?: string | null;
  pageTitle?: string | null;
  startedAt?: string | null;
}) {
  console.info("[openPinna][voice] create session requested", {
    projectId: input.projectId || null,
    pinnaId: input.pinnaId || null,
    pageUrl: input.pageUrl || null,
    pageTitle: input.pageTitle || null,
    startedAt: input.startedAt || null,
  });

  return db.$transaction(async (tx) => {
    const session = await tx.voiceAudioSession.create({
      data: {
        projectId: input.projectId || null,
        pinnaId: input.pinnaId || null,
        sourceJson: asJsonValue(input.sourceJson),
        selectedText: input.selectedText || null,
        pageUrl: input.pageUrl || null,
        pageTitle: input.pageTitle || null,
        startedAt: input.startedAt ? new Date(input.startedAt) : null,
        status: "created",
      },
    });

    const audio = await tx.voiceAudio.create({
      data: {
        sessionId: session.id,
      },
    });

    console.info("[openPinna][voice] create session completed", {
      sessionId: session.id,
      audioId: audio.id,
    });

    return {
      sessionId: session.id,
      audioId: audio.id,
    };
  });
}

export async function getVoiceSession(sessionId: string) {
  return db.voiceAudioSession.findUnique({
    where: { id: sessionId },
    include: {
      audio: true,
      chunks: {
        orderBy: { chunkIndex: "asc" },
      },
    },
  });
}

export async function storeVoiceChunkAndTranscribe(input: {
  sessionId: string;
  audioId: string;
  chunkId: string;
  chunkIndex: number;
  mimeType: string;
  projectId?: string | null;
  pinnaId?: string | null;
  sourceJson?: unknown;
  selectedText?: string | null;
  pageUrl?: string | null;
  pageTitle?: string | null;
  startedAt?: string | null;
  audioChunk: File;
}) {
  console.info("[openPinna][voice] chunk upload requested", {
    sessionId: input.sessionId,
    audioId: input.audioId,
    chunkId: input.chunkId,
    chunkIndex: input.chunkIndex,
    mimeType: input.mimeType,
    chunkSize: input.audioChunk.size,
  });

  const session = await db.voiceAudioSession.findUnique({
    where: { id: input.sessionId },
    include: { audio: true },
  });

  if (!session || !session.audio) {
    console.error("[openPinna][voice] chunk upload rejected: session not found", {
      sessionId: input.sessionId,
      audioId: input.audioId,
    });
    throw new Error("VOICE_SESSION_NOT_FOUND");
  }

  if (session.audio.id !== input.audioId) {
    console.error("[openPinna][voice] chunk upload rejected: audio mismatch", {
      sessionId: input.sessionId,
      expectedAudioId: session.audio.id,
      receivedAudioId: input.audioId,
    });
    throw new Error("VOICE_AUDIO_MISMATCH");
  }

  const duplicate = await db.voiceAudioChunk.findFirst({
    where: {
      OR: [
        { chunkId: input.chunkId },
        { sessionId: input.sessionId, chunkIndex: input.chunkIndex },
      ],
    },
  });

  if (duplicate) {
    console.info("[openPinna][voice] chunk upload deduped", {
      sessionId: input.sessionId,
      chunkId: duplicate.chunkId,
      chunkIndex: duplicate.chunkIndex,
      status: duplicate.transcriptionStatus,
    });
    return {
      chunkId: duplicate.chunkId,
      chunkIndex: duplicate.chunkIndex,
      chunkPath: toVoiceRelativePath(duplicate.filePath),
      transcript: duplicate.transcript || undefined,
      status: duplicate.transcriptionStatus === "transcribed" ? "transcribed" : duplicate.transcriptionStatus,
    } as const;
  }

  const bytes = Buffer.from(await input.audioChunk.arrayBuffer());
  const stored = await writeVoiceChunkFile({
    audioId: input.audioId,
    chunkIndex: input.chunkIndex,
    mimeType: input.mimeType,
    bytes,
  });

  console.info("[openPinna][voice] chunk stored", {
    sessionId: input.sessionId,
    audioId: input.audioId,
    chunkId: input.chunkId,
    chunkIndex: input.chunkIndex,
    filePath: stored.relativePath,
    sizeBytes: stored.sizeBytes,
  });

  let chunk = await db.voiceAudioChunk.create({
    data: {
      sessionId: input.sessionId,
      audioId: input.audioId,
      chunkId: input.chunkId,
      chunkIndex: input.chunkIndex,
      filePath: stored.filePath,
      mimeType: input.mimeType,
      sizeBytes: stored.sizeBytes,
      transcriptionStatus: "stored",
    },
  }).catch(async (error) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await db.voiceAudioChunk.findFirst({
        where: {
          OR: [
            { chunkId: input.chunkId },
            { sessionId: input.sessionId, chunkIndex: input.chunkIndex },
          ],
        },
      });

      if (existing) {
        return existing;
      }
    }

    throw error;
  });

  await db.voiceAudioSession.update({
    where: { id: input.sessionId },
    data: {
      projectId: input.projectId || session.projectId || null,
      pinnaId: input.pinnaId || session.pinnaId || null,
      sourceJson: asJsonValue(input.sourceJson ?? session.sourceJson ?? undefined),
      selectedText: input.selectedText || session.selectedText || null,
      pageUrl: input.pageUrl || session.pageUrl || null,
      pageTitle: input.pageTitle || session.pageTitle || null,
      startedAt: input.startedAt ? new Date(input.startedAt) : session.startedAt,
      status: "recording",
    },
  });

  await db.voiceAudio.update({
    where: { id: input.audioId },
    data: {
      mimeType: input.mimeType,
    },
  });

  try {
    console.info("[openPinna][voice] chunk transcription started", {
      sessionId: input.sessionId,
      chunkId: chunk.chunkId,
      chunkIndex: chunk.chunkIndex,
    });

    await db.voiceAudioChunk.update({
      where: { id: chunk.id },
      data: { transcriptionStatus: "transcribing" },
    });

    const transcript = await transcribeAudioFile(stored.filePath);

    chunk = await db.voiceAudioChunk.update({
      where: { id: chunk.id },
      data: {
        transcript,
        transcriptionStatus: "transcribed",
        transcriptionError: null,
        transcribedAt: new Date(),
      },
    });

    console.info("[openPinna][voice] chunk transcription completed", {
      sessionId: input.sessionId,
      chunkId: chunk.chunkId,
      chunkIndex: chunk.chunkIndex,
      transcriptLength: transcript.length,
    });

    return {
      chunkId: chunk.chunkId,
      chunkIndex: chunk.chunkIndex,
      chunkPath: stored.relativePath,
      transcript: chunk.transcript || undefined,
      status: "transcribed",
    } as const;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transcription failed.";

    console.error("[openPinna][voice] chunk transcription failed", {
      sessionId: input.sessionId,
      chunkId: chunk.chunkId,
      chunkIndex: chunk.chunkIndex,
      message,
    });

    chunk = await db.voiceAudioChunk.update({
      where: { id: chunk.id },
      data: {
        transcriptionStatus: "transcription_failed",
        transcriptionError: message,
      },
    });

    return {
      chunkId: chunk.chunkId,
      chunkIndex: chunk.chunkIndex,
      chunkPath: stored.relativePath,
      status: "transcription_failed",
      transcript: undefined,
    } as const;
  }
}

async function createVoiceBackedNote(session: NonNullable<Awaited<ReturnType<typeof getVoiceSession>>>) {
  if (!session.projectId || !session.audio) {
    console.info("[openPinna][voice] note creation skipped", {
      sessionId: session.id,
      reason: "missing_project_or_audio",
    });
    return { noteId: undefined };
  }

  console.info("[openPinna][voice] note creation started", {
    sessionId: session.id,
    audioId: session.audio.id,
    projectId: session.projectId,
    chunkCount: session.chunks.length,
  });

  const daySessionResult = await getOrCreateTodaySession(session.projectId);
  const sourceJson = parseSourceJson(session.sourceJson);
  const sourcePayload = {
    sourceType: (sourceJson?.sourceType as string | undefined) || "web",
    title: (sourceJson?.title as string | undefined) || session.pageTitle || "Voice capture",
    abstract: (sourceJson?.abstract as string | undefined) || null,
    authors: Array.isArray(sourceJson?.authors) ? (sourceJson?.authors as string[]) : [],
    publicationYear:
      typeof sourceJson?.publicationYear === "number" ? (sourceJson.publicationYear as number) : null,
    venue: (sourceJson?.venue as string | undefined) || null,
    doi: (sourceJson?.doi as string | undefined) || null,
    url: session.pageUrl || null,
    pdfUrl: (sourceJson?.pdfUrl as string | undefined) || null,
    metadata: {
      ...(sourceJson?.metadata && typeof sourceJson.metadata === "object" ? sourceJson.metadata : {}),
      voiceCapture: {
        sessionId: session.id,
        audioId: session.audio.id,
        pageUrl: session.pageUrl,
        pageTitle: session.pageTitle,
        selectedText: session.selectedText,
        pinnaId: session.pinnaId,
      },
      sourceJson,
    },
  };

  const source = session.pageUrl
    ? await createSourceFromUrl(session.projectId, daySessionResult.session.id, sourcePayload)
    : null;

  console.info("[openPinna][voice] note source resolved", {
    sessionId: session.id,
    projectId: session.projectId,
    sessionDayId: daySessionResult.session.id,
    sourceId: source?.id || null,
    createdSession: daySessionResult.created,
  });

  const note = await createNote({
    projectId: session.projectId,
    sessionId: daySessionResult.session.id,
    sourceId: source?.id || null,
    voiceSessionId: session.id,
    voiceAudioId: session.audio.id,
    noteText:
      (session.selectedText || "").trim() ||
      (session.audio.finalTranscript || "").trim() ||
      "Voice recording",
    userCommentary: (session.audio.finalTranscript || "").trim() || null,
  });

  await db.voiceAudioSession.update({
    where: { id: session.id },
    data: { noteId: note.id },
  });

  console.info("[openPinna][voice] note creation completed", {
    sessionId: session.id,
    noteId: note.id,
  });

  return { noteId: note.id };
}

export async function finalizeVoiceSession(sessionId: string) {
  console.info("[openPinna][voice] finalize requested", {
    sessionId,
  });

  const session = await getVoiceSession(sessionId);

  if (!session || !session.audio) {
    console.error("[openPinna][voice] finalize rejected: session not found", {
      sessionId,
    });
    throw new Error("VOICE_SESSION_NOT_FOUND");
  }

  console.info("[openPinna][voice] finalize loaded session", {
    sessionId: session.id,
    audioId: session.audio.id,
    status: session.status,
    chunkCount: session.chunks.length,
    chunkIndexes: session.chunks.map((chunk) => chunk.chunkIndex),
    mimeType: session.audio.mimeType || null,
  });

  if (session.status === "completed" && session.audio.fullAudioPath && session.audio.finalTranscript !== null) {
    console.info("[openPinna][voice] finalize short-circuited: already completed", {
      sessionId: session.id,
      audioId: session.audio.id,
      noteId: session.noteId || null,
    });
    return {
      sessionId: session.id,
      audioId: session.audio.id,
      fullAudioPath: session.audio.fullAudioPath,
      finalTranscript: session.audio.finalTranscript || "",
      noteId: session.noteId || undefined,
    };
  }

  if (session.chunks.length === 0) {
    console.error("[openPinna][voice] finalize failed: no chunks found", {
      sessionId: session.id,
      audioId: session.audio.id,
    });
    throw new Error("VOICE_NO_CHUNKS_TO_FINALIZE");
  }

  await db.voiceAudioSession.update({
    where: { id: session.id },
    data: {
      status: "finalizing",
      endedAt: new Date(),
    },
  });

  const chunkPaths = session.chunks.map((chunk) => chunk.filePath);
  const mimeType = session.audio.mimeType || session.chunks[0]?.mimeType || "audio/webm";
  console.info("[openPinna][voice] finalize combining chunks", {
    sessionId: session.id,
    audioId: session.audio.id,
    mimeType,
    chunkPaths: session.chunks.map((chunk) => toVoiceRelativePath(chunk.filePath)),
  });
  const fullAudioPath = await combineAudioChunks(session.audio.id, chunkPaths, mimeType);
  const finalTranscript = buildFinalTranscript(session.chunks);

  console.info("[openPinna][voice] finalize combined outputs", {
    sessionId: session.id,
    audioId: session.audio.id,
    fullAudioPath: toVoiceRelativePath(fullAudioPath),
    finalTranscriptLength: finalTranscript.length,
  });

  await db.voiceAudio.update({
    where: { id: session.audio.id },
    data: {
      fullAudioPath: toVoiceRelativePath(fullAudioPath),
      finalTranscript,
      mimeType,
    },
  });

  const refreshedSession = await getVoiceSession(session.id);
  if (!refreshedSession) {
    throw new Error("VOICE_SESSION_NOT_FOUND");
  }

  const { noteId } = await createVoiceBackedNote(refreshedSession);

  await db.voiceAudioSession.update({
    where: { id: session.id },
    data: {
      status: "completed",
      noteId: noteId || session.noteId || null,
    },
  });

  console.info("[openPinna][voice] finalize completed", {
    sessionId: session.id,
    audioId: session.audio.id,
    noteId: noteId || null,
    fullAudioPath: toVoiceRelativePath(fullAudioPath),
  });

  return {
    sessionId: session.id,
    audioId: session.audio.id,
    fullAudioPath: toVoiceRelativePath(fullAudioPath),
    finalTranscript,
    noteId,
  };
}
