import {
  AgentRunResult,
  ObserverDecision,
  ObserverKnowledgeContext,
} from "@/src/agents/core/agent-types";

const knowledgeChangePatterns = [
  /\bclaim\b/i,
  /\bevidence\b/i,
  /\bconclusion\b/i,
  /\bassumption\b/i,
  /\bcounterargument\b/i,
  /\btherefore\b/i,
  /\bimplies\b/i,
];

const lowSignalPatterns = [
  /^\s*(thanks|thank you|ok|okay|got it|cool|nice)\s*[.!?]*\s*$/i,
  /^\s*(hello|hi|hey)\s*[.!?]*\s*$/i,
];

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function isLowSignalMessage(value: string) {
  return lowSignalPatterns.some((pattern) => pattern.test(value));
}

function overlapsCurrentSummary(input: {
  assistantMessage: string;
  knowledge: ObserverKnowledgeContext;
}) {
  const candidate = normalizeText(input.assistantMessage).slice(0, 240);
  if (!candidate) return false;

  return input.knowledge.currentSummaries.some((summary) =>
    normalizeText(summary).includes(candidate),
  );
}

export function decideObserverOutcome(input: {
  knowledge: ObserverKnowledgeContext;
  agentResult: AgentRunResult;
}): ObserverDecision {
  const assistantMessage = input.agentResult.observerPayload.lastAssistantMessage;
  const userMessage = input.agentResult.observerPayload.lastUserMessage;
  const combined = `${userMessage}\n${assistantMessage}`;

  if (isLowSignalMessage(userMessage) && isLowSignalMessage(assistantMessage)) {
    return {
      shouldEmit: false,
      shouldRebuildKnowledge: false,
      shouldRunChainRebuild: false,
      eventType: "observer_noop",
      reason: "Turn is conversational and does not alter knowledge state.",
      payload: {},
      priority: "low",
    };
  }

  if (overlapsCurrentSummary({ assistantMessage, knowledge: input.knowledge })) {
    return {
      shouldEmit: false,
      shouldRebuildKnowledge: false,
      shouldRunChainRebuild: false,
      eventType: "observer_noop",
      reason: "Assistant output duplicates the current knowledge snapshot.",
      payload: {},
      priority: "low",
    };
  }

  const hasKnowledgeSignal =
    knowledgeChangePatterns.some((pattern) => pattern.test(combined)) ||
    input.agentResult.toolCalls.some((toolCall) => toolCall.status === "completed");

  if (!hasKnowledgeSignal) {
    return {
      shouldEmit: false,
      shouldRebuildKnowledge: false,
      shouldRunChainRebuild: false,
      eventType: "observer_noop",
      reason: "No durable knowledge change detected.",
      payload: {},
      priority: "low",
    };
  }

  return {
    shouldEmit: true,
    shouldRebuildKnowledge: true,
    shouldRunChainRebuild: true,
    eventType: "pinna_knowledge_refresh_requested",
    reason: "Turn introduced durable knowledge-bearing content.",
    payload: {
      currentEventSeq: input.knowledge.currentEventSeq.toString(),
      toolCalls: input.agentResult.toolCalls.map((toolCall) => ({
        id: toolCall.id,
        toolKey: toolCall.toolKey,
        status: toolCall.status,
      })),
    },
    priority: input.agentResult.toolCalls.length > 0 ? "high" : "normal",
  };
}
