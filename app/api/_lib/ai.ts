// Placeholder AI abstraction for MVP. Replace with real model calls when available.
export async function generateAssistantReply(context: {
  noteText: string;
  sourceTitle?: string | null;
  captureText?: string | null;
  threadSummary?: string | null;
  recentMessages: Array<{ role: string; content: string }>;
  userMessage: string;
}) {
  const snippets = [
    context.noteText,
    context.captureText || "",
    context.threadSummary || "",
    context.recentMessages.map((m) => `${m.role}: ${m.content}`).join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 3000);

  return `Isolated thread response (MVP placeholder).\n\nQuestion: ${context.userMessage}\n\nGrounded context:\n${snippets}`;
}

export async function summarizeText(parts: string[], label: string) {
  const merged = parts.filter(Boolean).join("\n\n").slice(0, 5000);
  if (!merged) return `${label} summary pending.`;
  return `${label} summary (MVP placeholder): ${merged.slice(0, 500)}`;
}

export async function maybeEmbed(_text: string): Promise<number[] | null> {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }
  // TODO: integrate real embedding provider.
  return null;
}
