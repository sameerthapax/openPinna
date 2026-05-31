import { buildThreadKnowledgeSnapshot } from "@/app/api/_lib/services/knowledge.service";
import { jsonOk } from "@/app/api/_lib/http";

type Ctx = { params: Promise<{ threadId: string }> };

export async function POST(_request: Request, context: Ctx) {
  const { threadId } = await context.params;
  const build = await buildThreadKnowledgeSnapshot(threadId);
  return jsonOk({ build });
}
