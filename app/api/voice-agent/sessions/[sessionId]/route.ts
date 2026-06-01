import { jsonError, jsonOk } from "@/app/api/_lib/http";
import { getVoiceSession } from "@/app/api/_lib/services/voice/voice-session.service";

type Ctx = { params: Promise<{ sessionId: string }> };

export async function GET(_request: Request, context: Ctx) {
  const { sessionId } = await context.params;
  const session = await getVoiceSession(sessionId);

  if (!session) {
    return jsonError("Voice session not found.", 404);
  }

  return jsonOk({ session });
}
