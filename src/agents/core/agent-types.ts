export type AgentKind = "pinna" | "observer";

export type AgentTransportMode = "responses-loop";
export type AgentRunnerKind = "responses-api";
export type MemoryProviderKind = "mem0";
export type ObserverMode = "rules-v1";
export type AgentScope = "PROJECT" | "SESSION" | "NOTE";

export type ToolDescriptor = {
  key: string;
  description: string | null;
  schema: unknown;
  requiresShell?: boolean;
};

export type PinnaAgentRuntimeConfig = {
  provider: "openai";
  runner: AgentRunnerKind;
  transport: AgentTransportMode;
  skillKey: string;
  memoryProvider: MemoryProviderKind;
  memoryNamespace: string;
  observerKey: string;
  observerMode: ObserverMode;
  observerNamespace: string;
  allowShell?: boolean;
};

export type SkillPromptInput = {
  scope: AgentScope;
  customInstructions?: string | null;
  memorySummary?: string | null;
  projectSummary?: string | null;
  sessionSummary?: string | null;
  sourceTitle?: string | null;
  selectedText?: string | null;
  currentClaim?: string | null;
  baseKnowledgeVersion?: {
    version: number;
    title?: string | null;
    summary?: string | null;
    keyFindings?: string | null;
    userView?: string | null;
    conclusion?: string | null;
  } | null;
  threadSummary?: string | null;
  allowedToolsSummary?: string | null;
  recentMessages?: Array<{ role: string; content: string }>;
};

export type PinnaSkillManifest = {
  key: string;
  displayName: string;
  scope: AgentScope;
  version: string;
  defaultModel: string;
  requiresShell: boolean;
  allowedTools: string[];
  outputFormat: "json_object";
};

export type MemorySearchResult = {
  summary: string;
  items: Array<{
    id: string;
    content: string;
    score?: number;
  }>;
  degraded: boolean;
};

export type MemoryWriteResult = {
  ok: boolean;
  operation: string;
  degraded: boolean;
  detail?: string;
};

export type ExecutedToolCall = {
  id: string;
  toolKey: string;
  input: Record<string, unknown>;
  status: "completed" | "failed" | "denied";
  output?: unknown;
  error?: string;
};

export type ObserverPayload = {
  lastUserMessage: string;
  lastAssistantMessage: string;
  toolCalls: ExecutedToolCall[];
};

export type AgentDefinition<TInput, TResult> = {
  kind: AgentKind;
  key: string;
  run(input: TInput): Promise<TResult>;
};

export type PinnaSkillDefinition = {
  key: string;
  displayName: string;
  scope: AgentScope;
  version: string;
  defaultModel: string;
  requiresShell: boolean;
  allowedTools: string[];
  runtimePrompt: string;
  manifest: PinnaSkillManifest;
  manifestPath: string;
  runtimePath: string;
  skillDocPath: string;
};

export type AgentContext = {
  threadId: string;
  pinnaId: string;
  scope: AgentScope;
  skillKey: string;
  allowShell: boolean;
  runtimeAllowShell: boolean;
  projectId: string;
  sessionId: string;
  noteId: string;
  templateKey: string;
  customInstructions?: string | null;
  projectSummary?: string | null;
  sessionSummary?: string | null;
  sourceTitle?: string | null;
  selectedText?: string | null;
  currentClaim?: string | null;
  baseKnowledgeVersion?: {
    version: number;
    title?: string | null;
    summary?: string | null;
    keyFindings?: string | null;
    userView?: string | null;
    conclusion?: string | null;
  } | null;
  threadSummary?: string | null;
  memorySummary?: string | null;
  memoryNamespace: string;
};

export type AgentRunInput = {
  context: AgentContext;
  userMessage: string;
  recentMessages: Array<{ role: string; content: string }>;
  allowedTools: ToolDescriptor[];
  streamSink?: PinnaTurnStreamSink;
};

export type AgentRunResult = {
  assistantMessage: string;
  toolCalls: ExecutedToolCall[];
  memoryWrites: MemoryWriteResult[];
  observerPayload: ObserverPayload;
  updatedCurrentClaim?: string | null;
};

export type PersistedChatMessage = {
  id: string;
  threadId: string;
  role: string;
  content: string;
  createdAt: string;
};

export type PinnaTurnStreamEvent =
  | {
      type: "run.started";
      threadId: string;
      userMessageLength: number;
    }
  | {
      type: "assistant.delta";
      delta: string;
      responseId?: string;
      iteration: number;
    }
  | {
      type: "tool.started";
      toolKey: string;
      toolCallId: string;
      iteration: number;
    }
  | {
      type: "tool.completed";
      toolKey: string;
      toolCallId: string;
      iteration: number;
      status: "completed" | "failed" | "denied";
    }
  | {
      type: "run.completed";
      run: AgentRunResult;
      userMessage: PersistedChatMessage;
      assistantMessage: PersistedChatMessage;
      messages: PersistedChatMessage[];
    }
  | {
      type: "run.error";
      message: string;
    };

export type PinnaTurnStreamSink = (event: PinnaTurnStreamEvent) => void;

export type ObserverKnowledgeContext = {
  currentEventSeq: bigint;
  currentBuildId: string | null;
  currentSummaries: string[];
};

export type ObserverDecision = {
  shouldEmit: boolean;
  shouldRebuildKnowledge: boolean;
  shouldRunChainRebuild: boolean;
  eventType: string;
  reason: string;
  payload: Record<string, unknown>;
  priority: "low" | "normal" | "high";
  summary?: string;
  summaryLabel?: string;
  windowMessageCount?: number;
};
