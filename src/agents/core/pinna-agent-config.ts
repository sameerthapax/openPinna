import { PinnaAgentRuntimeConfig } from "@/src/agents/core/agent-types";

export function buildDefaultPinnaAgentConfig(input: {
  pinnaId: string;
  skillKey: string;
}): PinnaAgentRuntimeConfig {
  return {
    provider: "openai",
    runner: "responses-api",
    transport: "responses-loop",
    skillKey: input.skillKey,
    allowShell: false,
    memoryProvider: "mem0",
    memoryNamespace: `pinna:${input.pinnaId}`,
    observerKey: "pinna-default-observer",
    observerMode: "rules-v1",
    observerNamespace: `observer:${input.pinnaId}`,
  };
}

export function normalizePinnaAgentConfig(
  value: unknown,
  input: { pinnaId: string; skillKey: string },
): PinnaAgentRuntimeConfig {
  const defaults = buildDefaultPinnaAgentConfig(input);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaults;
  }

  const candidate = value as Partial<PinnaAgentRuntimeConfig>;

  return {
    provider: "openai",
    runner: candidate.runner === "responses-api" ? candidate.runner : defaults.runner,
    transport:
      candidate.transport === "responses-loop"
        ? candidate.transport
        : defaults.transport,
    allowShell: typeof candidate.allowShell === "boolean" ? candidate.allowShell : false,
    skillKey:
      typeof candidate.skillKey === "string" && candidate.skillKey.trim().length > 0
        ? candidate.skillKey
        : defaults.skillKey,
    memoryProvider:
      candidate.memoryProvider === "mem0"
        ? candidate.memoryProvider
        : defaults.memoryProvider,
    memoryNamespace:
      typeof candidate.memoryNamespace === "string" &&
      candidate.memoryNamespace.trim().length > 0
        ? candidate.memoryNamespace
        : defaults.memoryNamespace,
    observerKey:
      typeof candidate.observerKey === "string" && candidate.observerKey.trim().length > 0
        ? candidate.observerKey
        : defaults.observerKey,
    observerMode:
      candidate.observerMode === "rules-v1"
        ? candidate.observerMode
        : defaults.observerMode,
    observerNamespace:
      typeof candidate.observerNamespace === "string" &&
      candidate.observerNamespace.trim().length > 0
        ? candidate.observerNamespace
        : defaults.observerNamespace,
  };
}
