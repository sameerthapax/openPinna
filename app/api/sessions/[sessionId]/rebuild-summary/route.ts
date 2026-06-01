import { rebuildSessionSummary } from "@/app/api/_lib/services/knowledge.service";
import { jsonOk } from "@/app/api/_lib/http";

type Ctx = { params: Promise<{ sessionId: string }> };
export async function POST(_request: Request, context: Ctx) {
  const { sessionId } = await context.params;
  const summary = await rebuildSessionSummary(sessionId);
  return jsonOk({ summary });
}
