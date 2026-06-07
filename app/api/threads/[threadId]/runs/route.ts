import { runPinnaThreadTurn } from "@/src/agents/core/agent-orchestrator";
import { createThreadRunSchema } from "@/app/api/_lib/validation";
import { jsonError, jsonOk, parseJson, zodError } from "@/app/api/_lib/http";

type Ctx = { params: Promise<{ threadId: string }> };

export async function POST(request: Request, context: Ctx) {
  const { threadId } = await context.params;
  const payload = await parseJson(request);
  const parsed = createThreadRunSchema.safeParse(payload);
  if (!parsed.success) return jsonError(zodError(parsed.error));

  try {
    const run = await runPinnaThreadTurn({
      threadId,
      userMessage: parsed.data.userMessage,
    });

    return jsonOk({ run }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run pinna agent.";
    return jsonError(message, 400);
  }
}
