import { readFile } from "node:fs/promises";
import path from "node:path";

const transcriptionModel = process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe";

function normalizeTranscriptionLanguage(languageHint?: string | null) {
  const value = (languageHint || "").trim();

  if (!value) {
    return null;
  }

  const normalized = value.replace(/_/g, "-").split("-")[0]?.toLowerCase() || "";

  if (!/^[a-z]{2,3}$/.test(normalized)) {
    return null;
  }

  return normalized;
}

export async function getVoiceBackendStatus() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return {
      openAiConfigured: false,
      openAiReachable: false,
      message: "OPENAI_API_KEY is missing on the backend.",
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const json = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;

      return {
        openAiConfigured: true,
        openAiReachable: false,
        message: json?.error?.message || "OpenAI is not reachable from the backend.",
      };
    }

    return {
      openAiConfigured: true,
      openAiReachable: true,
      message: "OpenAI is reachable from the backend.",
    };
  } catch (error) {
    return {
      openAiConfigured: true,
      openAiReachable: false,
      message: error instanceof Error ? error.message : "OpenAI reachability check failed.",
    };
  }
}

export async function transcribeAudioFile(filePath: string, languageHint?: string | null): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY_MISSING");
  }

  const bytes = await readFile(filePath);
  const filename = path.basename(filePath);
  const mimeType = filename.endsWith(".mp4") ? "audio/mp4" : "audio/webm";
  const formData = new FormData();
  formData.append("model", transcriptionModel);
  formData.append("file", new Blob([bytes], { type: mimeType }), filename);
  const normalizedLanguage = normalizeTranscriptionLanguage(languageHint);
  if (normalizedLanguage) {
    formData.append("language", normalizedLanguage);
  }

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  const json = (await response.json().catch(() => null)) as
    | { text?: string; error?: { message?: string } }
    | null;

  if (!response.ok) {
    throw new Error(json?.error?.message || `Transcription request failed with status ${response.status}.`);
  }

  return (json?.text || "").trim();
}
