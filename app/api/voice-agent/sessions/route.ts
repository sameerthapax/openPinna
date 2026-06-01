import { jsonError, jsonOk, parseJson, zodError } from "@/app/api/_lib/http";
import { createVoiceSessionSchema } from "@/app/api/_lib/validation";
import { createVoiceSession } from "@/app/api/_lib/services/voice/voice-session.service";

export async function POST(request: Request) {
  const payload = await parseJson(request);
  const parsed = createVoiceSessionSchema.safeParse(payload);

  if (!parsed.success) {
    return jsonError(zodError(parsed.error));
  }

  const session = await createVoiceSession(parsed.data);
  return jsonOk(session, 201);
}
