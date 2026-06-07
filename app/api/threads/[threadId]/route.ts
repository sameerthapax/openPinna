import { getThread, getThreadMessagesPage } from "@/app/api/_lib/services/chat.service";
import { jsonError, jsonOk } from "@/app/api/_lib/http";

type Ctx = { params: Promise<{ threadId: string }> };

export async function GET(request: Request, context: Ctx) {
  const { threadId } = await context.params;
  const url = new URL(request.url);
  const beforeCreatedAt = url.searchParams.get("beforeCreatedAt");
  const beforeMessageId = url.searchParams.get("beforeMessageId");
  const limitParam = Number(url.searchParams.get("limit") || "100");
  const thread = await getThread(threadId);
  if (!thread) return jsonError("Thread not found.", 404);
  const messagePage = await getThreadMessagesPage({
    threadId,
    limit: Number.isFinite(limitParam) ? limitParam : 100,
    beforeCreatedAt,
    beforeMessageId,
  });
  return jsonOk({ thread, ...messagePage });
}
