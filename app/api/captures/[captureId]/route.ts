import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import { getUploadRoot } from "@/app/api/_lib/storage";
import { getVoiceUploadRoot } from "@/app/api/_lib/services/voice/voice-storage.service";
import { getCapture } from "@/app/api/_lib/services/capture.service";

function isInsideAllowedRoot(targetPath: string) {
  const uploadRoot = getUploadRoot();
  const voiceRoot = getVoiceUploadRoot();
  return targetPath.startsWith(uploadRoot) || targetPath.startsWith(voiceRoot);
}

function guessContentType(filePath: string) {
  if (filePath.endsWith(".pdf")) {
    return "application/pdf";
  }

  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (filePath.endsWith(".webp")) {
    return "image/webp";
  }

  return "image/png";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ captureId: string }> },
) {
  const { captureId } = await params;
  const capture = await getCapture(captureId);

  const storagePath = capture?.storagePath || capture?.imagePath;

  if (!storagePath) {
    notFound();
  }

  const absolutePath = path.resolve(process.cwd(), storagePath);

  if (!isInsideAllowedRoot(absolutePath)) {
    notFound();
  }

  const bytes = await readFile(absolutePath).catch(() => null);

  if (!bytes) {
    notFound();
  }

  return new Response(bytes, {
    headers: {
      "Content-Type": capture?.mimeType || guessContentType(absolutePath),
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "no-store",
      "Content-Disposition": `${capture?.artifactType === "pdf" ? "inline" : "inline"}; filename="${capture?.fileName || path.basename(absolutePath)}"`,
    },
  });
}
