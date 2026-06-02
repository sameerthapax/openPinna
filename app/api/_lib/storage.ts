import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const uploadRoot = process.env.UPLOAD_DIR || "./uploads";

function safeName(filename: string) {
  const base = path.basename(filename);
  return base.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function writeUploadedFile(file: File, relDir: string) {
  const dir = path.join(uploadRoot, relDir);
  await mkdir(dir, { recursive: true });

  const safeFilename = `${Date.now()}-${safeName(file.name || "upload.bin")}`;
  const fullPath = path.join(dir, safeFilename);

  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(fullPath, bytes);

  return {
    filePath: fullPath,
    originalFilename: file.name,
    mimeType: file.type || null,
    fileSizeBytes: bytes.length,
  };
}

export function sourceDir(projectId: string, sessionId: string) {
  return `projects/${projectId}/sessions/${sessionId}/sources`;
}

export function captureDir(projectId: string, sessionId: string) {
  return `projects/${projectId}/sessions/${sessionId}/captures`;
}

export function captureArtifactDir(
  projectId: string,
  sessionId: string,
  artifactType: "screenshot" | "pdf",
) {
  const artifactFolder = artifactType === "pdf" ? "pdfs" : "screenshots";
  return `${captureDir(projectId, sessionId)}/${artifactFolder}`;
}

export function getUploadRoot() {
  return path.resolve(uploadRoot);
}
