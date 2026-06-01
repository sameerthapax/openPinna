import { jsonError, jsonOk, zodError } from "@/app/api/_lib/http";
import { storeVoiceChunkAndTranscribe } from "@/app/api/_lib/services/voice/voice-session.service";
import { voiceChunkMetadataSchema } from "@/app/api/_lib/validation";

const maxChunkBytes = 12 * 1024 * 1024;

type Ctx = { params: Promise<{ sessionId: string }> };

export async function POST(request: Request, context: Ctx) {
  const { sessionId } = await context.params;
  console.info("[openPinna][voice] chunk route hit", { sessionId });
  const form = await request.formData();
  const audioChunk = form.get("audioChunk");

  if (!(audioChunk instanceof File)) {
    console.error("[openPinna][voice] chunk route rejected: missing file", { sessionId });
    return jsonError("audioChunk file is required.");
  }

  if (audioChunk.size <= 0 || audioChunk.size > maxChunkBytes) {
    console.error("[openPinna][voice] chunk route rejected: invalid file size", {
      sessionId,
      size: audioChunk.size,
    });
    return jsonError("audioChunk size is invalid.");
  }

  const parsed = voiceChunkMetadataSchema.safeParse({
    audioId: form.get("audioId"),
    chunkId: form.get("chunkId"),
    chunkIndex: form.get("chunkIndex"),
    mimeType: form.get("mimeType"),
    sourceJson: form.get("sourceJson"),
    selectedText: form.get("selectedText"),
    projectId: form.get("projectId"),
    pinnaId: form.get("pinnaId"),
    pageUrl: form.get("pageUrl"),
    pageTitle: form.get("pageTitle"),
    startedAt: form.get("startedAt"),
  });

  if (!parsed.success) {
    console.error("[openPinna][voice] chunk route rejected: invalid metadata", {
      sessionId,
      issues: parsed.error.issues,
    });
    return jsonError(zodError(parsed.error));
  }

  try {
    const result = await storeVoiceChunkAndTranscribe({
      sessionId,
      ...parsed.data,
      audioChunk,
    });

    console.info("[openPinna][voice] chunk route completed", {
      sessionId,
      chunkId: result.chunkId,
      chunkIndex: result.chunkIndex,
      status: result.status,
    });
    return jsonOk(result, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Voice chunk upload failed.";
    const status = message === "VOICE_SESSION_NOT_FOUND" || message === "VOICE_AUDIO_MISMATCH" ? 404 : 500;
    console.error("[openPinna][voice] chunk route failed", {
      sessionId,
      message,
      status,
    });
    return jsonError(message, status);
  }
}
