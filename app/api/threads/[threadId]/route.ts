import { getThread } from "@/app/api/_lib/services/chat.service";
import { jsonError, jsonOk } from "@/app/api/_lib/http";

type Ctx = { params: Promise<{ threadId: string }> };

export async function GET(_request: Request, context: Ctx) {
  const { threadId } = await context.params;
  const thread = await getThread(threadId);
  if (!thread) return jsonError("Thread not found.", 404);
  return jsonOk({ thread });
}
