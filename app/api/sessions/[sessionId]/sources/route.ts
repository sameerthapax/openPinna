import { listSourcesBySession } from "@/app/api/_lib/services/source.service";
import { jsonOk } from "@/app/api/_lib/http";

type Ctx = { params: Promise<{ sessionId: string }> };

export async function GET(_request: Request, context: Ctx) {
  const { sessionId } = await context.params;
  const sources = await listSourcesBySession(sessionId);
  return jsonOk({ sources });
}
