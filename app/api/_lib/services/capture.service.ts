import { db } from "@/lib/db";
import { captureDir, writeUploadedFile } from "@/app/api/_lib/storage";

export async function createCapture(input: {
  sourceId: string;
  sessionId: string;
  imageFile: File;
  selectedText?: string | null;
  surroundingText?: string | null;
  pageNumber?: number | null;
  coordinates?: { x?: number | null; y?: number | null };
  caption?: string | null;
}) {
  const source = await db.source.findUnique({ where: { id: input.sourceId } });
  if (!source) throw new Error("Source not found.");

  const saved = await writeUploadedFile(input.imageFile, captureDir(source.projectId, input.sessionId));

  return db.capture.create({
    data: {
      sourceId: input.sourceId,
      sessionId: input.sessionId,
      imagePath: saved.filePath,
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
