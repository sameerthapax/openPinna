import { getOpenAIClient } from "@/src/agents/openai/openai-client";
import { AgentDefinition, ObserverDecision } from "@/src/agents/core/agent-types";
import {
  ObserverRunInput,
  abstractObserverDefinition,
} from "@/src/agents/observer/abstract-observer";

function buildObserverPrompt(input: ObserverRunInput) {
  return [
    "You are a batched pinna observer. Review the prior observer summary if it exists, the current thread summary, and the exact 30-message batch window.",
    "Return a single JSON object with keys: summary, summaryLabel, shouldEmit, shouldRebuildKnowledge, shouldRunChainRebuild, eventType, reason, payload, priority, windowMessageCount.",
    "The summary should be a concise incremental summary for this batch window, suitable for chaining after the previous observer summary.",
    "The payload must be an object, and the response must not include markdown.",
    `Current event sequence: ${input.knowledge.currentEventSeq.toString()}`,
    `Current build id: ${input.knowledge.currentBuildId || "none"}`,
    `Current knowledge summaries:\n${
      input.knowledge.currentSummaries.length > 0
        ? input.knowledge.currentSummaries.map((summary) => `- ${summary}`).join("\n")
        : "- none"
    }`,
    `Previous observer summary:\n${input.previousWindowSummary || "none"}`,
    `Thread summary:\n${input.threadSummary || "none"}`,
    `Message count in thread: ${input.messageCount}`,
    `Batch window messages:\n${
      input.recentMessages.length > 0
        ? input.recentMessages.map((message) => `${message.role}: ${message.content}`).join("\n")
        : "none"
    }`,
    "Set shouldRebuildKnowledge to true only if this batch changes durable thread knowledge enough to warrant a new knowledge build.",
    "Set shouldRunChainRebuild to true only if the downstream note/session/project summaries should also refresh.",
  ].join("\n\n");
}

function parseObserverDecision(value: string): ObserverDecision {
  try {
    const parsed = JSON.parse(value) as Partial<ObserverDecision>;
    if (
      typeof parsed.shouldEmit === "boolean" &&
      typeof parsed.eventType === "string" &&
      typeof parsed.reason === "string" &&
      (parsed.priority === "low" ||
        parsed.priority === "normal" ||
        parsed.priority === "high")
    ) {
      const shouldRebuildKnowledge =
        typeof parsed.shouldRebuildKnowledge === "boolean"
          ? parsed.shouldRebuildKnowledge
          : parsed.shouldEmit;
      const shouldRunChainRebuild =
        typeof parsed.shouldRunChainRebuild === "boolean"
          ? parsed.shouldRunChainRebuild
          : shouldRebuildKnowledge;

      return {
        shouldEmit: parsed.shouldEmit,
        shouldRebuildKnowledge,
        shouldRunChainRebuild,
        eventType: parsed.eventType,
        reason: parsed.reason,
        payload:
          parsed.payload && typeof parsed.payload === "object" && !Array.isArray(parsed.payload)
            ? (parsed.payload as Record<string, unknown>)
            : {},
        priority: parsed.priority,
        summary: typeof parsed.summary === "string" ? parsed.summary : undefined,
        summaryLabel:
          typeof parsed.summaryLabel === "string" ? parsed.summaryLabel : undefined,
        windowMessageCount:
          typeof parsed.windowMessageCount === "number"
            ? parsed.windowMessageCount
            : undefined,
      };
    }
  } catch {
    // Fall through to the default decision below.
  }

  return {
    shouldEmit: false,
    shouldRebuildKnowledge: false,
    shouldRunChainRebuild: false,
    eventType: "observer_noop",
    reason: "Observer returned an invalid decision payload.",
    payload: {},
    priority: "low",
  };
}

export const pinnaObserverDefinition: AgentDefinition<
  ObserverRunInput,
  ObserverDecision
> = {
  ...abstractObserverDefinition,
  key: "pinna-default-observer",
  async run(input) {
    const client = getOpenAIClient();
    const observerPrompt = buildObserverPrompt(input);
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      instructions:
        "You are a pinna observer. Evaluate whether a pinna turn should refresh knowledge. Return only JSON.",
      input: [
        {
          role: "developer",
          content: observerPrompt,
        },
      ],
      text: {
        format: {
          type: "json_object",
        },
      },
      store: false,
      metadata: {
        observer_key: "pinna-default-observer",
        message_count: String(input.messageCount),
      },
    });

    return parseObserverDecision(response.output_text || "");
  },
};
