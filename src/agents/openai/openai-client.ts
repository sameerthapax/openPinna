import OpenAI from "openai";

let openAIClient: OpenAI | null = null;

export function getOpenAIClient() {
  if (!openAIClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required for Responses API agent runs.");
    }

    openAIClient = new OpenAI({ apiKey });
  }

  return openAIClient;
}
