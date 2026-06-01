import { jsonError, jsonOk, parseJson, zodError } from "@/app/api/_lib/http";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const voiceUploadSchema = z.object({
  mimeType: z.string().min(1),
  base64: z.string().min(1),
  size: z.number().int().nonnegative().optional(),
  createdAt: z.string().optional(),
});

function extensionFromMimeType(mimeType: string) {
  if (mimeType.includes("webm")) {
    return "webm";
  }
  if (mimeType.includes("ogg")) {
    return "ogg";
  }
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) {
    return "mp3";
  }
  return "bin";
}

export async function POST(request: Request) {
  const body = await parseJson(request);
  const parsed = voiceUploadSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(zodError(parsed.error));
  }

  try {
    const uploadDir = process.env.VOICE_UPLOAD_DIR || "./audio";
    await mkdir(uploadDir, { recursive: true });

    const ext = extensionFromMimeType(parsed.data.mimeType);
    const filename = `voice-${Date.now()}.${ext}`;
    const fullPath = path.join(uploadDir, filename);
    const bytes = Buffer.from(parsed.data.base64, "base64");

    await writeFile(fullPath, bytes);

    return jsonOk(
      {
        file: {
          path: fullPath,
          filename,
          mimeType: parsed.data.mimeType,
          size: bytes.length,
        },
      },
      201,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not store voice recording.";
    return jsonError(message, 500);
  }
}
