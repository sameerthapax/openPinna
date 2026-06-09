export type ThreadMessageLike = {
  role: string;
};

// Bootstrap prompts are stored as system messages so the visible thread starts on the answer,
// not the internal setup question that primes the first OpenAI request.
export function isVisibleThreadMessage(message: ThreadMessageLike) {
  return message.role === "user" || message.role === "assistant";
}

export function filterVisibleThreadMessages<T extends ThreadMessageLike>(messages: T[]) {
  return messages.filter(isVisibleThreadMessage);
}
