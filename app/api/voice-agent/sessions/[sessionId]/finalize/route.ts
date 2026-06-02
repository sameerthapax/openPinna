import { jsonError, jsonOk } from "@/app/api/_lib/http";
import { finalizeVoiceSession } from "@/app/api/_lib/services/voice/voice-session.service";

type Ctx = { params: Promise<{ sessionId: string }> };

export async function POST(_request: Request, context: Ctx) {
  const { sessionId } = await context.params;
  console.info("[openPinna][voice] finalize route hit", { sessionId });

  try {
    const result = await finalizeVoiceSession(sessionId);
    console.info("[openPinna][voice] finalize route completed", {
      sessionId,
      audioId: result.audioId,
      noteId: result.noteId || null,
    });
    return jsonOk(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Voice session finalize failed.";
    const status = message === "VOICE_SESSION_NOT_FOUND" ? 404 : 500;
    console.error("[openPinna][voice] finalize route failed", {
      sessionId,
      message,
      status,
    });
    return jsonError(message, status);
  }
}
