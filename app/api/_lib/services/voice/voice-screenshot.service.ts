import sharp from "sharp";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { createCapture, createCaptureFromStoredFile, getCapture } from "@/app/api/_lib/services/capture.service";
import { updateNoteSourceCapture } from "@/app/api/_lib/services/note.service";
import { getOrCreateTodaySession } from "@/app/api/_lib/services/session.service";
import { createSourceFromUrl, getSource } from "@/app/api/_lib/services/source.service";
import {
  toVoiceRelativePath,
  writeVoiceScreenshotChunkFile,
  writeVoiceScreenshotFullImageFile,
  writeVoiceScreenshotManifestFile,
} from "./voice-storage.service";

type ParsedSourceJson = Record<string, unknown> | null;

function asJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value as Prisma.InputJsonValue;
}

function screenshotOwnerId(session: { audioId?: string | null; voiceSessionId: string }) {
  return session.audioId || session.voiceSessionId;
}

function parseSourceJson(value: unknown): ParsedSourceJson {
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

function readExtensionScreenshotRefs(sourceJson: ParsedSourceJson) {
  const metadata =
    sourceJson?.metadata && typeof sourceJson.metadata === "object" && !Array.isArray(sourceJson.metadata)
      ? (sourceJson.metadata as Record<string, unknown>)
      : null;
  const extensionScreenshot =
    metadata?.extensionScreenshot &&
    typeof metadata.extensionScreenshot === "object" &&
    !Array.isArray(metadata.extensionScreenshot)
      ? (metadata.extensionScreenshot as Record<string, unknown>)
      : null;

  return {
    sourceId:
      extensionScreenshot && typeof extensionScreenshot.sourceId === "string"
        ? extensionScreenshot.sourceId
        : null,
    captureId:
      extensionScreenshot && typeof extensionScreenshot.captureId === "string"
        ? extensionScreenshot.captureId
        : null,
  };
}

function withExtensionScreenshotMetadata(
  sourceJson: ParsedSourceJson,
  patch: {
    screenshotId: string;
    sourceId?: string | null;
    captureId?: string | null;
    fullImagePath?: string | null;
    manifestPath?: string | null;
    chunkCount: number;
    pageUrl?: string | null;
    pageTitle?: string | null;
  },
) {
  const base = sourceJson ?? {};
  const metadata =
    base.metadata && typeof base.metadata === "object" && !Array.isArray(base.metadata)
      ? (base.metadata as Record<string, unknown>)
      : {};
  const previous =
    metadata.extensionScreenshot &&
    typeof metadata.extensionScreenshot === "object" &&
    !Array.isArray(metadata.extensionScreenshot)
      ? (metadata.extensionScreenshot as Record<string, unknown>)
      : {};

  return {
    ...base,
    metadata: {
      ...metadata,
      extensionScreenshot: {
        ...previous,
        screenshotId: patch.screenshotId,
        sourceId: patch.sourceId || null,
        captureId: patch.captureId || null,
        fullImagePath: patch.fullImagePath || null,
        manifestPath: patch.manifestPath || null,
        chunkCount: patch.chunkCount,
        pageUrl: patch.pageUrl || null,
        pageTitle: patch.pageTitle || null,
      },
    },
  };
}

async function mergeScreenshotChunks(input: {
  chunks: Array<{
    chunkIndex: number;
    filePath: string;
  }>;
}) {
  const segmentPlans: Array<{
    input: Buffer;
    left: number;
    top: number;
  }> = [];
  let outputWidth = 0;
  let outputHeight = 0;

  for (const chunk of input.chunks) {
    const image = sharp(chunk.filePath, { limitInputPixels: false });
    const metadata = await image.metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    if (width <= 0 || height <= 0) {
      continue;
    }

    const inputBuffer = await image.png().toBuffer();
    const top = outputHeight;

    segmentPlans.push({
      input: inputBuffer,
      left: 0,
      top,
    });

    outputWidth = Math.max(outputWidth, width);
    outputHeight += height;
  }

  if (segmentPlans.length === 0 || outputWidth <= 0 || outputHeight <= 0) {
    throw new Error("VOICE_SCREENSHOT_NO_VISIBLE_SEGMENTS");
  }

  return sharp({
    create: {
      width: outputWidth,
      height: outputHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(segmentPlans)
    .png()
    .toBuffer();
}

function buildVoiceCaptureSourcePayload(input: {
  sourceJson: ParsedSourceJson;
  pageUrl?: string | null;
  pageTitle?: string | null;
  selectedText?: string | null;
  voiceSessionId: string;
  audioId?: string | null;
  pinnaId?: string | null;
}) {
  return {
    sourceType: (input.sourceJson?.sourceType as string | undefined) || "web",
    title: (input.sourceJson?.title as string | undefined) || input.pageTitle || "Voice capture",
    abstract: (input.sourceJson?.abstract as string | undefined) || null,
    authors: Array.isArray(input.sourceJson?.authors) ? (input.sourceJson.authors as string[]) : [],
    publicationYear:
      typeof input.sourceJson?.publicationYear === "number" ? (input.sourceJson.publicationYear as number) : null,
    venue: (input.sourceJson?.venue as string | undefined) || null,
    doi: (input.sourceJson?.doi as string | undefined) || null,
    url: input.pageUrl || null,
    pdfUrl: (input.sourceJson?.pdfUrl as string | undefined) || null,
    metadata: {
      ...(input.sourceJson?.metadata && typeof input.sourceJson.metadata === "object" ? input.sourceJson.metadata : {}),
      voiceCapture: {
        sessionId: input.voiceSessionId,
        audioId: input.audioId || null,
        pageUrl: input.pageUrl || null,
        pageTitle: input.pageTitle || null,
        selectedText: input.selectedText || null,
        pinnaId: input.pinnaId || null,
      },
      sourceJson: input.sourceJson,
    },
  };
}

export async function startVoiceScreenshotSession(input: {
  voiceSessionId: string;
  audioId?: string | null;
  projectId?: string | null;
  pinnaId?: string | null;
  pageUrl?: string | null;
  pageTitle?: string | null;
  sourceJson?: unknown;
  selectedText?: string | null;
  documentHeight?: number | null;
  viewportWidth?: number | null;
  viewportHeight?: number | null;
  devicePixelRatio?: number | null;
}) {
  const voiceSession = await db.voiceAudioSession.findUnique({
    where: { id: input.voiceSessionId },
    include: { audio: true, screenshotSession: true },
  });

  if (!voiceSession) {
    throw new Error("VOICE_SESSION_NOT_FOUND");
  }

  const resolvedAudioId = input.audioId || voiceSession.audio?.id || null;

  if (resolvedAudioId && voiceSession.audio?.id && voiceSession.audio.id !== resolvedAudioId) {
    throw new Error("VOICE_AUDIO_MISMATCH");
  }

  if (voiceSession.screenshotSession) {
    const session = await db.voiceScreenshotSession.update({
      where: { voiceSessionId: input.voiceSessionId },
      data: {
        audioId: resolvedAudioId,
        projectId: input.projectId || voiceSession.projectId || null,
        pinnaId: input.pinnaId || voiceSession.pinnaId || null,
        pageUrl: input.pageUrl || voiceSession.pageUrl || null,
        pageTitle: input.pageTitle || voiceSession.pageTitle || null,
        sourceJson: asJsonValue(input.sourceJson ?? parseSourceJson(voiceSession.sourceJson) ?? undefined),
        selectedText: input.selectedText || voiceSession.selectedText || null,
        documentHeight: input.documentHeight ?? undefined,
        viewportWidth: input.viewportWidth ?? undefined,
        viewportHeight: input.viewportHeight ?? undefined,
        devicePixelRatio: input.devicePixelRatio ?? undefined,
        status:
          voiceSession.screenshotSession.status === "completed"
            ? voiceSession.screenshotSession.status
            : "capturing",
        errorMessage: null,
      },
    });

    return {
      screenshotId: session.id,
    };
  }

  const session = await db.voiceScreenshotSession.create({
    data: {
      voiceSessionId: input.voiceSessionId,
      audioId: resolvedAudioId,
      projectId: input.projectId || voiceSession.projectId || null,
      pinnaId: input.pinnaId || voiceSession.pinnaId || null,
      pageUrl: input.pageUrl || voiceSession.pageUrl || null,
      pageTitle: input.pageTitle || voiceSession.pageTitle || null,
      sourceJson: asJsonValue(input.sourceJson ?? parseSourceJson(voiceSession.sourceJson) ?? undefined),
      selectedText: input.selectedText || voiceSession.selectedText || null,
      documentHeight: input.documentHeight ?? null,
      viewportWidth: input.viewportWidth ?? null,
      viewportHeight: input.viewportHeight ?? null,
      devicePixelRatio: input.devicePixelRatio ?? null,
      status: "capturing",
    },
  });

  return {
    screenshotId: session.id,
  };
}

export async function storeVoiceScreenshotChunk(input: {
  voiceSessionId: string;
  screenshotId: string;
  audioId?: string | null;
  chunkId: string;
  chunkIndex: number;
  pageUrl?: string | null;
  pageTitle?: string | null;
  scrollY: number;
  viewportWidth: number;
  viewportHeight: number;
  documentHeight: number;
  devicePixelRatio: number;
  capturedAt: string;
  imageChunk: File;
}) {
  const screenshotSession = await db.voiceScreenshotSession.findUnique({
    where: { voiceSessionId: input.voiceSessionId },
  });

  if (!screenshotSession || screenshotSession.id !== input.screenshotId) {
    throw new Error("VOICE_SCREENSHOT_SESSION_NOT_FOUND");
  }

  if (input.audioId && screenshotSession.audioId && input.audioId !== screenshotSession.audioId) {
    throw new Error("VOICE_AUDIO_MISMATCH");
  }

  const duplicate = await db.voiceScreenshotChunk.findFirst({
    where: {
      OR: [
        { chunkId: input.chunkId },
        { screenshotSessionId: input.screenshotId, chunkIndex: input.chunkIndex },
      ],
    },
  });

  if (duplicate) {
    return {
      screenshotId: screenshotSession.id,
      chunkId: duplicate.chunkId,
      chunkIndex: duplicate.chunkIndex,
      filePath: toVoiceRelativePath(duplicate.filePath),
      status: "stored" as const,
    };
  }

  const bytes = Buffer.from(await input.imageChunk.arrayBuffer());
  const stored = await writeVoiceScreenshotChunkFile({
    ownerId: screenshotOwnerId(screenshotSession),
    chunkIndex: input.chunkIndex,
    mimeType: input.imageChunk.type || "image/png",
    bytes,
  });

  const chunk = await db.voiceScreenshotChunk.create({
    data: {
      screenshotSessionId: screenshotSession.id,
      voiceSessionId: input.voiceSessionId,
      audioId: screenshotSession.audioId,
      chunkId: input.chunkId,
      chunkIndex: input.chunkIndex,
      filePath: stored.filePath,
      mimeType: input.imageChunk.type || "image/png",
      sizeBytes: stored.sizeBytes,
      pageUrl: input.pageUrl || screenshotSession.pageUrl || null,
      pageTitle: input.pageTitle || screenshotSession.pageTitle || null,
      scrollY: input.scrollY,
      viewportWidth: input.viewportWidth,
      viewportHeight: input.viewportHeight,
      documentHeight: input.documentHeight,
      devicePixelRatio: input.devicePixelRatio,
      capturedAt: new Date(input.capturedAt),
      status: "stored",
    },
  }).catch(async (error: unknown) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await db.voiceScreenshotChunk.findFirst({
        where: {
          OR: [
            { chunkId: input.chunkId },
            { screenshotSessionId: input.screenshotId, chunkIndex: input.chunkIndex },
          ],
        },
      });

      if (existing) {
        return existing;
      }
    }

    throw error;
  });

  await db.voiceScreenshotSession.update({
    where: { id: screenshotSession.id },
    data: {
      status: "capturing",
      errorMessage: null,
    },
  });

  return {
    screenshotId: screenshotSession.id,
    chunkId: chunk.chunkId,
    chunkIndex: chunk.chunkIndex,
    filePath: stored.relativePath,
    status: "stored" as const,
  };
}

export async function storeVoicePdfArtifact(input: {
  voiceSessionId: string;
  audioId?: string | null;
  pageUrl?: string | null;
  pageTitle?: string | null;
  sourceJson?: unknown;
  file: File;
  fileName?: string | null;
  mimeType?: string | null;
  originalUrl?: string | null;
}) {
  const voiceSession = await db.voiceAudioSession.findUnique({
    where: { id: input.voiceSessionId },
    include: {
      note: true,
      audio: true,
      screenshotSession: true,
    },
  });

  if (!voiceSession) {
    throw new Error("VOICE_SESSION_NOT_FOUND");
  }

  const resolvedAudioId = input.audioId || voiceSession.audio?.id || null;
  if (resolvedAudioId && voiceSession.audio?.id && voiceSession.audio.id !== resolvedAudioId) {
    throw new Error("VOICE_AUDIO_MISMATCH");
  }

  const sourceJson = parseSourceJson(input.sourceJson ?? voiceSession.sourceJson);
  const projectId = voiceSession.projectId;
  const pageUrl = input.pageUrl || voiceSession.pageUrl || input.originalUrl || null;
  const pageTitle = input.pageTitle || voiceSession.pageTitle || "PDF capture";

  if (!projectId) {
    throw new Error("VOICE_PROJECT_MISSING");
  }

  const targetSessionId =
    voiceSession.note?.sessionId || (await getOrCreateTodaySession(projectId)).session.id;

  const screenshotSession =
    voiceSession.screenshotSession ||
    (await db.voiceScreenshotSession.create({
      data: {
        voiceSessionId: input.voiceSessionId,
        audioId: resolvedAudioId,
        projectId,
        pinnaId: voiceSession.pinnaId || null,
        pageUrl,
        pageTitle,
        sourceJson: asJsonValue(sourceJson ?? undefined),
        selectedText: null,
        status: "capturing",
      },
    }));

  let sourceId = screenshotSession.sourceId || readExtensionScreenshotRefs(sourceJson).sourceId || voiceSession.note?.sourceId || null;

  if (sourceId) {
    const existingSource = await getSource(sourceId);
    if (!existingSource || existingSource.projectId !== projectId || existingSource.sessionId !== targetSessionId) {
      sourceId = null;
    }
  }

  if (!sourceId) {
    const source = await createSourceFromUrl(
      projectId,
      targetSessionId,
      buildVoiceCaptureSourcePayload({
        sourceJson,
        pageUrl,
        pageTitle,
        selectedText: null,
        voiceSessionId: input.voiceSessionId,
        audioId: resolvedAudioId,
        pinnaId: voiceSession.pinnaId,
      }),
    );
    sourceId = source.id;
  }

  let captureId = screenshotSession.captureId || readExtensionScreenshotRefs(sourceJson).captureId || null;

  if (captureId) {
    const existingCapture = await getCapture(captureId);
    if (!existingCapture || existingCapture.sourceId !== sourceId || existingCapture.sessionId !== targetSessionId) {
      captureId = null;
    }
  }

  const capture =
    captureId
      ? await getCapture(captureId)
      : await createCapture({
          sourceId,
          sessionId: targetSessionId,
          artifactFile: input.file,
          artifactType: "pdf",
          captureMode: "pdf-download",
          mimeType: input.mimeType || input.file.type || "application/pdf",
          originalUrl: input.originalUrl || pageUrl,
          title: pageTitle,
          fileName: input.fileName || input.file.name || `${input.voiceSessionId}.pdf`,
          source: "browser-extension",
          caption: pageTitle || "PDF captured",
        });

  captureId = capture?.id || captureId;

  const storagePath = capture?.storagePath || capture?.imagePath || null;
  const nextSourceJson = withExtensionScreenshotMetadata(sourceJson, {
    screenshotId: screenshotSession.id,
    sourceId,
    captureId,
    fullImagePath: storagePath,
    manifestPath: null,
    chunkCount: 1,
    pageUrl,
    pageTitle,
  });

  await db.$transaction(async (tx) => {
    await tx.voiceScreenshotSession.update({
      where: { id: screenshotSession.id },
      data: {
        audioId: resolvedAudioId,
        projectId,
        sourceId,
        captureId,
        pageUrl,
        pageTitle,
        sourceJson: asJsonValue(sourceJson ?? undefined),
        fullImagePath: storagePath,
        manifestPath: null,
        status: "completed",
        errorMessage: null,
        completedAt: new Date(),
      },
    });

    await tx.voiceAudioSession.update({
      where: { id: input.voiceSessionId },
      data: {
        sourceJson: asJsonValue(nextSourceJson),
      },
    });
  });

  if (voiceSession.noteId) {
    await updateNoteSourceCapture(voiceSession.noteId, {
      sourceId,
      captureId,
    });
  }

  return {
    screenshotId: screenshotSession.id,
    captureId,
    sourceId,
    filePath: storagePath || "",
    artifactType: "pdf" as const,
  };
}

export async function finalizeVoiceScreenshotSession(voiceSessionId: string) {
  const screenshotSession = await db.voiceScreenshotSession.findUnique({
    where: { voiceSessionId },
    include: {
      chunks: {
        orderBy: { chunkIndex: "asc" },
      },
      voiceSession: {
        include: {
          note: true,
          audio: true,
        },
      },
    },
  });

  if (!screenshotSession) {
    throw new Error("VOICE_SCREENSHOT_SESSION_NOT_FOUND");
  }

  if (
    screenshotSession.status === "completed" &&
    screenshotSession.manifestPath &&
    screenshotSession.fullImagePath &&
    screenshotSession.captureId
  ) {
    return {
      screenshotId: screenshotSession.id,
      chunkCount: screenshotSession.chunks.length,
      manifestPath: screenshotSession.manifestPath,
      fullImagePath: screenshotSession.fullImagePath,
      captureId: screenshotSession.captureId,
      sourceId: screenshotSession.sourceId,
    };
  }

  if (screenshotSession.chunks.length === 0) {
    const failed = await db.voiceScreenshotSession.update({
      where: { id: screenshotSession.id },
      data: {
        status: "failed",
        errorMessage: "No screenshot chunks were stored.",
        completedAt: new Date(),
      },
    });

    return {
      screenshotId: failed.id,
      chunkCount: 0,
      manifestPath: failed.manifestPath || "",
      fullImagePath: failed.fullImagePath || "",
      captureId: failed.captureId || null,
      sourceId: failed.sourceId || null,
    };
  }

  const ownerId = screenshotOwnerId(screenshotSession);
  const sourceJson = parseSourceJson(screenshotSession.sourceJson ?? screenshotSession.voiceSession.sourceJson);
  const screenshotRefs = readExtensionScreenshotRefs(sourceJson);
  let fullImagePath = screenshotSession.fullImagePath || null;

  if (!fullImagePath) {
    const mergedPng = await mergeScreenshotChunks({
      chunks: screenshotSession.chunks.map((chunk) => ({
        chunkIndex: chunk.chunkIndex,
        filePath: chunk.filePath,
      })),
    });

    const storedFullImage = await writeVoiceScreenshotFullImageFile({
      ownerId,
      bytes: mergedPng,
    });

    fullImagePath = storedFullImage.relativePath;
  }

  const projectId = screenshotSession.projectId || screenshotSession.voiceSession.projectId || null;
  const targetSessionId =
    screenshotSession.voiceSession.note?.sessionId || (projectId ? (await getOrCreateTodaySession(projectId)).session.id : null);

  let sourceId = screenshotSession.sourceId || screenshotRefs.sourceId || screenshotSession.voiceSession.note?.sourceId || null;
  let captureId = screenshotSession.captureId || screenshotRefs.captureId || null;

  if (sourceId && targetSessionId) {
    const existingSource = await getSource(sourceId);

    if (
      !existingSource ||
      (projectId && existingSource.projectId !== projectId) ||
      existingSource.sessionId !== targetSessionId
    ) {
      sourceId = null;
    }
  }

  if (!sourceId && projectId && targetSessionId && (screenshotSession.pageUrl || screenshotSession.pageTitle)) {
    const source = await createSourceFromUrl(
      projectId,
      targetSessionId,
      buildVoiceCaptureSourcePayload({
        sourceJson,
        pageUrl: screenshotSession.pageUrl || screenshotSession.voiceSession.pageUrl,
        pageTitle: screenshotSession.pageTitle || screenshotSession.voiceSession.pageTitle,
        selectedText: screenshotSession.selectedText || screenshotSession.voiceSession.selectedText,
        voiceSessionId: screenshotSession.voiceSessionId,
        audioId: screenshotSession.audioId || screenshotSession.voiceSession.audio?.id,
        pinnaId: screenshotSession.pinnaId || screenshotSession.voiceSession.pinnaId,
      }),
    );

    sourceId = source.id;
  }

  if (captureId) {
    const existingCapture = await getCapture(captureId);

    if (!existingCapture || (sourceId && existingCapture.sourceId !== sourceId) || (targetSessionId && existingCapture.sessionId !== targetSessionId)) {
      captureId = null;
    }
  }

  if (!captureId && sourceId && targetSessionId && fullImagePath) {
    const capture = await createCaptureFromStoredFile({
      sourceId,
      sessionId: targetSessionId,
      storagePath: fullImagePath,
      artifactType: "screenshot",
      captureMode: "page-screenshot",
      mimeType: "image/png",
      originalUrl: screenshotSession.pageUrl || screenshotSession.voiceSession.pageUrl || null,
      title: screenshotSession.pageTitle || screenshotSession.voiceSession.pageTitle || "Voice session screenshot",
      fileName: "full.png",
      source: "browser-extension",
      selectedText: screenshotSession.selectedText || screenshotSession.voiceSession.selectedText || null,
      caption: screenshotSession.pageTitle || screenshotSession.voiceSession.pageTitle || "Voice session screenshot",
    });

    captureId = capture.id;
  }

  const manifest = {
    screenshotId: screenshotSession.id,
    voiceSessionId: screenshotSession.voiceSessionId,
    audioId: screenshotSession.audioId,
    pageUrl: screenshotSession.pageUrl,
    pageTitle: screenshotSession.pageTitle,
    chunkCount: screenshotSession.chunks.length,
    fullImagePath,
    sourceId,
    captureId,
    chunks: screenshotSession.chunks.map((chunk) => ({
      chunkIndex: chunk.chunkIndex,
      filePath: toVoiceRelativePath(chunk.filePath),
      scrollY: chunk.scrollY,
      viewportWidth: chunk.viewportWidth,
      viewportHeight: chunk.viewportHeight,
      capturedAt: chunk.capturedAt?.toISOString() || null,
    })),
  };

  const storedManifest = await writeVoiceScreenshotManifestFile({
    ownerId,
    manifest,
  });

  const nextSourceJson = withExtensionScreenshotMetadata(sourceJson, {
    screenshotId: screenshotSession.id,
    sourceId,
    captureId,
    fullImagePath,
    manifestPath: storedManifest.relativePath,
    chunkCount: screenshotSession.chunks.length,
    pageUrl: screenshotSession.pageUrl || screenshotSession.voiceSession.pageUrl,
    pageTitle: screenshotSession.pageTitle || screenshotSession.voiceSession.pageTitle,
  });

  const completed = await db.$transaction(async (tx) => {
    const updatedScreenshotSession = await tx.voiceScreenshotSession.update({
      where: { id: screenshotSession.id },
      data: {
        status: "completed",
        sourceId,
        captureId,
        fullImagePath,
        manifestPath: storedManifest.relativePath,
        errorMessage: null,
        completedAt: new Date(),
      },
    });

    await tx.voiceAudioSession.update({
      where: { id: screenshotSession.voiceSessionId },
      data: {
        sourceJson: asJsonValue(nextSourceJson),
      },
    });

    return updatedScreenshotSession;
  });

  if (screenshotSession.voiceSession.noteId && sourceId) {
    await updateNoteSourceCapture(screenshotSession.voiceSession.noteId, {
      sourceId,
      captureId,
    });
  }

  return {
    screenshotId: completed.id,
    chunkCount: screenshotSession.chunks.length,
    manifestPath: storedManifest.relativePath,
    fullImagePath: fullImagePath || "",
    captureId,
    sourceId,
  };
}

export async function cancelVoiceScreenshotSession(voiceSessionId: string) {
  const screenshotSession = await db.voiceScreenshotSession.findUnique({
    where: { voiceSessionId },
  });

  if (!screenshotSession) {
    return {
      screenshotId: undefined,
      status: "cancelled" as const,
    };
  }

  if (screenshotSession.status === "completed") {
    return {
      screenshotId: screenshotSession.id,
      status: "cancelled" as const,
    };
  }

  const cancelled = await db.voiceScreenshotSession.update({
    where: { id: screenshotSession.id },
    data: {
      status: "cancelled",
      completedAt: new Date(),
    },
  });

  return {
    screenshotId: cancelled.id,
    status: "cancelled" as const,
  };
}
