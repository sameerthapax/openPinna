import { db } from "@/lib/db";
import { captureArtifactDir, writeUploadedFile } from "@/app/api/_lib/storage";

export const captureArtifactTypes = ["screenshot", "pdf"] as const;
export const captureModes = ["viewport-screenshot", "page-screenshot", "pdf-download"] as const;

export type CaptureArtifactType = (typeof captureArtifactTypes)[number];
export type CaptureMode = (typeof captureModes)[number];

export async function createCapture(input: {
  sourceId: string;
  sessionId: string;
  artifactFile: File;
  artifactType?: CaptureArtifactType;
  captureMode?: CaptureMode;
  mimeType?: string | null;
  originalUrl?: string | null;
  title?: string | null;
  fileName?: string | null;
  source?: string | null;
  selectedText?: string | null;
  surroundingText?: string | null;
  pageNumber?: number | null;
  coordinates?: { x?: number | null; y?: number | null };
  caption?: string | null;
}) {
  const source = await db.source.findUnique({ where: { id: input.sourceId } });
  if (!source) throw new Error("Source not found.");

  const artifactType = input.artifactType || "screenshot";
  const captureMode =
    input.captureMode || (artifactType === "pdf" ? "pdf-download" : "viewport-screenshot");

  const saved = await writeUploadedFile(
    input.artifactFile,
    captureArtifactDir(source.projectId, input.sessionId, artifactType),
  );

  return db.capture.create({
    data: {
      sourceId: input.sourceId,
      sessionId: input.sessionId,
      imagePath: saved.filePath,
      storagePath: saved.filePath,
      artifactType,
      captureMode,
      mimeType: input.mimeType || saved.mimeType || null,
      originalUrl: input.originalUrl || null,
      title: input.title || null,
      fileName: input.fileName || saved.originalFilename || null,
      sourceLabel: input.source || "browser-extension",
      selectedText: input.selectedText || null,
      surroundingText: input.surroundingText || null,
      pageNumber: input.pageNumber ?? null,
      xPosition: input.coordinates?.x ?? null,
      yPosition: input.coordinates?.y ?? null,
      caption: input.caption || null,
    },
  });
}

export async function createCaptureFromStoredFile(input: {
  sourceId: string;
  sessionId: string;
  storagePath: string;
  artifactType?: CaptureArtifactType;
  captureMode?: CaptureMode;
  mimeType?: string | null;
  originalUrl?: string | null;
  title?: string | null;
  fileName?: string | null;
  source?: string | null;
  selectedText?: string | null;
  surroundingText?: string | null;
  pageNumber?: number | null;
  coordinates?: { x?: number | null; y?: number | null };
  caption?: string | null;
}) {
  const source = await db.source.findUnique({ where: { id: input.sourceId } });
  if (!source) throw new Error("Source not found.");
  if (source.sessionId !== input.sessionId) throw new Error("Source does not belong to session.");

  return db.capture.create({
    data: {
      sourceId: input.sourceId,
      sessionId: input.sessionId,
      imagePath: input.storagePath,
      storagePath: input.storagePath,
      artifactType: input.artifactType || "screenshot",
      captureMode:
        input.captureMode || (input.artifactType === "pdf" ? "pdf-download" : "viewport-screenshot"),
      mimeType: input.mimeType || null,
      originalUrl: input.originalUrl || null,
      title: input.title || null,
      fileName: input.fileName || null,
      sourceLabel: input.source || "browser-extension",
      selectedText: input.selectedText || null,
      surroundingText: input.surroundingText || null,
      pageNumber: input.pageNumber ?? null,
      xPosition: input.coordinates?.x ?? null,
      yPosition: input.coordinates?.y ?? null,
      caption: input.caption || null,
    },
  });
}

export async function getCapture(captureId: string) {
  return db.capture.findUnique({ where: { id: captureId } });
}

export async function listCapturesBySource(sourceId: string) {
  return db.capture.findMany({ where: { sourceId }, orderBy: { createdAt: "desc" } });
}

export async function findLatestCaptureBySourceUrl(input: {
  projectId: string;
  sessionId: string;
  urls: string[];
}) {
  const normalizedUrls = input.urls
    .map((value) => value.trim())
    .filter(Boolean);

  if (normalizedUrls.length === 0) {
    return null;
  }

  const sources = await db.source.findMany({
    where: {
      projectId: input.projectId,
      sessionId: input.sessionId,
      OR: [
        { url: { in: normalizedUrls } },
        { pdfUrl: { in: normalizedUrls } },
      ],
    },
    include: {
      captures: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const firstWithCapture = sources.find((source) => source.captures.length > 0);
  const source = firstWithCapture || sources[0] || null;
  const capture = source?.captures[0] || null;

  if (!source) {
    return null;
  }

  return {
    source,
    capture,
  };
}
