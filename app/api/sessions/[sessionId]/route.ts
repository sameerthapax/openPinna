import { getSession } from "@/app/api/_lib/services/session.service";
import { jsonError, jsonOk } from "@/app/api/_lib/http";

type Ctx = { params: Promise<{ sessionId: string }> };

export async function GET(_request: Request, context: Ctx) {
  const { sessionId } = await context.params;
  const session = await getSession(sessionId);
  if (!session) return jsonError("Session not found.", 404);
  return jsonOk({ session });
}
