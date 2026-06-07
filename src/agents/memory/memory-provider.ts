import {
  MemorySearchResult,
  MemoryWriteResult,
} from "@/src/agents/core/agent-types";

export type MemoryProviderContext = {
  namespace: string;
  pinnaId: string;
  threadId: string;
  noteId: string;
};

export interface MemoryProvider {
  searchContext(input: {
    context: MemoryProviderContext;
    query: string;
  }): Promise<MemorySearchResult>;
  appendTurn(input: {
    context: MemoryProviderContext;
    userMessage: string;
    assistantMessage: string;
  }): Promise<MemoryWriteResult>;
  getSnapshot(input: {
    context: MemoryProviderContext;
  }): Promise<MemorySearchResult>;
  deleteContexts(input: {
    contexts: MemoryProviderContext[];
  }): Promise<MemoryWriteResult>;
}
