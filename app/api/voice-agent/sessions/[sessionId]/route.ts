import { jsonError, jsonOk, parseJson, zodError } from "@/app/api/_lib/http";
import { getVoiceSession, updateVoiceSession } from "@/app/api/_lib/services/voice/voice-session.service";
import { updateVoiceSessionSchema } from "@/app/api/_lib/validation";

type Ctx = { params: Promise<{ sessionId: string }> };

export async function GET(_request: Request, context: Ctx) {
  const { sessionId } = await context.params;
  const session = await getVoiceSession(sessionId);

  if (!session) {
    return jsonError("Voice session not found.", 404);
  }

  return jsonOk({ session });
}

export async function PATCH(request: Request, context: Ctx) {
  const { sessionId } = await context.params;
  const payload = await parseJson(request);
  const parsed = updateVoiceSessionSchema.safeParse(payload);

  if (!parsed.success) {
    return jsonError(zodError(parsed.error));
  }

  try {
    const session = await updateVoiceSession({
      sessionId,
      sourceJson: parsed.data.sourceJson,
    });

    return jsonOk({
      session: {
        id: session.id,
        noteId: session.noteId,
        status: session.status,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Voice session update failed.";
    return jsonError(message, message === "VOICE_SESSION_NOT_FOUND" ? 404 : 500);
  }
}
