import { runPinnaThreadTurn } from "@/src/agents/core/agent-orchestrator";
import { createThreadRunSchema } from "@/app/api/_lib/validation";
import { jsonError, jsonOk, parseJson, zodError } from "@/app/api/_lib/http";
import type { PinnaTurnStreamEvent } from "@/src/agents/core/agent-types";

type Ctx = { params: Promise<{ threadId: string }> };

function encodeStreamEvent(event: PinnaTurnStreamEvent) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: Request, context: Ctx) {
  const { threadId } = await context.params;
  const payload = await parseJson(request);
  const parsed = createThreadRunSchema.safeParse(payload);
  if (!parsed.success) return jsonError(zodError(parsed.error));

  if (parsed.data.stream) {
    const encoder = new TextEncoder();

    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const emit = (event: PinnaTurnStreamEvent) => {
            controller.enqueue(encoder.encode(encodeStreamEvent(event)));
          };

          void runPinnaThreadTurn({
            threadId,
            userMessage: parsed.data.userMessage,
            streamSink: emit,
          })
            .then(() => {
              controller.close();
            })
            .catch(() => {
              controller.close();
            });
        },
      }),
      {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      },
    );
  }

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
