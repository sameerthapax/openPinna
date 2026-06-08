type ToolSchema = {
  key: string;
  description: string | null;
  schema: unknown;
};

export function parseToolDirective(
  userMessage: string,
  allowedToolKeys: string[],
): { toolKey: string; input: Record<string, unknown> } | null {
  const trimmed = userMessage.trim();
  const match = trimmed.match(/^\[tool:([a-z0-9_]+)\]\s*(\{[\s\S]*\})?$/i);
  if (!match) return null;

  const toolKey = match[1];
  if (!allowedToolKeys.includes(toolKey)) return null;

  const payload = match[2]?.trim();
  if (!payload) return { toolKey, input: {} };

  try {
    const input = JSON.parse(payload);
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    return { toolKey, input: input as Record<string, unknown> };
  } catch {
    return null;
  }
}

// Placeholder AI abstraction for MVP. Replace with real model calls when available.
export async function generateAssistantReply(context: {
  selectedText: string;
  sourceTitle?: string | null;
  captureText?: string | null;
  threadSummary?: string | null;
  recentMessages: Array<{ role: string; content: string }>;
  userMessage: string;
  pinnaSystemPrompt?: string | null;
  customInstructions?: string | null;
  allowedTools?: ToolSchema[];
  toolResult?: { toolKey: string; output?: unknown; error?: string } | null;
}) {
  const snippets = [
    context.pinnaSystemPrompt ? `System: ${context.pinnaSystemPrompt}` : "",
    context.customInstructions ? `Instructions: ${context.customInstructions}` : "",
    context.selectedText,
    context.captureText || "",
    context.threadSummary || "",
    context.recentMessages.map((m) => `${m.role}: ${m.content}`).join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 3000);

  const toolsLine =
    context.allowedTools && context.allowedTools.length
      ? `Allowed tools: ${context.allowedTools.map((tool) => tool.key).join(", ")}`
      : "Allowed tools: none";

  const toolResultLine = context.toolResult
    ? context.toolResult.error
      ? `Tool ${context.toolResult.toolKey} failed: ${context.toolResult.error}`
      : `Tool ${context.toolResult.toolKey} output: ${JSON.stringify(context.toolResult.output).slice(0, 600)}`
    : "";

  return `Isolated thread response (MVP placeholder).\n\nQuestion: ${context.userMessage}\n\n${toolsLine}${toolResultLine ? `\n${toolResultLine}` : ""}\n\nGrounded context:\n${snippets}`;
}

export async function summarizeText(parts: string[], label: string) {
  const merged = parts.filter(Boolean).join("\n\n").slice(0, 5000);
  if (!merged) return `${label} summary pending.`;
  return `${label} summary (MVP placeholder): ${merged.slice(0, 500)}`;
}

export async function maybeEmbed(text: string): Promise<number[] | null> {
  void text;
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }
  // TODO: integrate real embedding provider.
  return null;
}
