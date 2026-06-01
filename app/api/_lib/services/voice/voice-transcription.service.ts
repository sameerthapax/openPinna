import { readFile } from "node:fs/promises";
import path from "node:path";

const transcriptionModel = process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe";

export async function transcribeAudioFile(filePath: string): Promise<string> {
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
