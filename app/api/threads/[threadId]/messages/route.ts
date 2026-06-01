import { sendMessage } from "@/app/api/_lib/services/chat.service";
import { sendMessageSchema } from "@/app/api/_lib/validation";
import { jsonError, jsonOk, parseJson, zodError } from "@/app/api/_lib/http";

type Ctx = { params: Promise<{ threadId: string }> };

export async function POST(request: Request, context: Ctx) {
  const { threadId } = await context.params;
  const payload = await parseJson(request);
  const parsed = sendMessageSchema.safeParse(payload);
  if (!parsed.success) return jsonError(zodError(parsed.error));

  const message = await sendMessage(threadId, parsed.data.userMessage);
  return jsonOk({ assistantMessage: message }, 201);
}
