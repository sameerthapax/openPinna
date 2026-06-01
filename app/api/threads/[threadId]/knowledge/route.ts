import { getThreadKnowledge } from "@/app/api/_lib/services/knowledge.service";
import { jsonOk } from "@/app/api/_lib/http";

type Ctx = { params: Promise<{ threadId: string }> };

export async function GET(_request: Request, context: Ctx) {
  const { threadId } = await context.params;
  const knowledge = await getThreadKnowledge(threadId);
  return jsonOk(knowledge);
}
