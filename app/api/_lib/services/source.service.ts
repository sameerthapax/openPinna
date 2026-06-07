import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { sourceDir, writeUploadedFile } from "@/app/api/_lib/storage";
import { sourceProcessingQueue } from "@/app/api/_lib/queues";

type SourceUrlInput = {
  sourceType?: string | null;
  title?: string | null;
  abstract?: string | null;
  authors?: string[] | null;
  publicationYear?: number | null;
  publicationDate?: string | null;
  venue?: string | null;
  doi?: string | null;
  url?: string | null;
  pdfUrl?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function createSourceFromUpload(
  projectId: string,
  sessionId: string,
  file: File,
  metadata: Record<string, unknown>,
) {
  const saved = await writeUploadedFile(file, sourceDir(projectId, sessionId));

  const source = await db.source.create({
    data: {
      projectId,
      sessionId,
      sourceType: "paper",
      title: (metadata.title as string) || file.name,
      metadata: metadata as Prisma.InputJsonValue,
      ...saved,
    },
  });

  await sourceProcessingQueue.add("source-processing", { sourceId: source.id });
  return source;
}

export async function createSourceFromUrl(
  projectId: string,
  sessionId: string,
  input: SourceUrlInput,
) {
  const source = await db.source.create({
    data: {
      projectId,
      sessionId,
      sourceType: input.sourceType || "paper",
      title: input.title || null,
      abstract: input.abstract || null,
      authors: input.authors || [],
      publicationYear: input.publicationYear || null,
      publicationDate: input.publicationDate ? new Date(input.publicationDate) : null,
      venue: input.venue || null,
      doi: input.doi || null,
      url: input.url || null,
      pdfUrl: input.pdfUrl || null,
      metadata: (input.metadata || {}) as Prisma.InputJsonValue,
    },
  });
  await sourceProcessingQueue.add("source-processing", { sourceId: source.id });
  return source;
}

export async function updateSourceMetadata(sourceId: string, metadata: Record<string, unknown>) {
  return db.source.update({ where: { id: sourceId }, data: { metadata: metadata as Prisma.InputJsonValue } });
}

export async function getSource(sourceId: string) {
  return db.source.findUnique({ where: { id: sourceId } });
}

export async function listSourcesBySession(sessionId: string) {
  return db.source.findMany({ where: { sessionId }, orderBy: { createdAt: "desc" } });
}
