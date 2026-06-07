import {
  AgentDefinition,
  ObserverDecision,
  ObserverKnowledgeContext,
} from "@/src/agents/core/agent-types";

export type ObserverRunInput = {
  knowledge: ObserverKnowledgeContext;
  threadSummary: string | null;
  previousWindowSummary: string | null;
  recentMessages: Array<{ role: string; content: string }>;
  messageCount: number;
};

export const abstractObserverDefinition: AgentDefinition<
  ObserverRunInput,
  ObserverDecision
> = {
  kind: "observer",
  key: "abstract-observer",
  async run() {
    return {
      shouldEmit: false,
      shouldRebuildKnowledge: false,
      shouldRunChainRebuild: false,
      eventType: "observer_noop",
      reason: "Observer base definition does not make decisions directly.",
      payload: {},
      priority: "low",
    };
  },
};
