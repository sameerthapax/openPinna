import { createThreadKnowledgeEvent } from "@/app/api/_lib/services/knowledge.service";
import { createThreadKnowledgeEventSchema } from "@/app/api/_lib/validation";
import { jsonError, jsonOk, parseJson, zodError } from "@/app/api/_lib/http";

type Ctx = { params: Promise<{ threadId: string }> };

export async function POST(request: Request, context: Ctx) {
  const { threadId } = await context.params;
  const payload = await parseJson(request);
  const parsed = createThreadKnowledgeEventSchema.safeParse(payload);
  if (!parsed.success) return jsonError(zodError(parsed.error));

  const event = await createThreadKnowledgeEvent({
    threadId,
    ...parsed.data,
  });

  return jsonOk({ event }, 201);
}
