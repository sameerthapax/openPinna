import { z } from "zod";
import { jsonError, jsonOk } from "@/app/api/_lib/http";
import { transcribeMacosAudio } from "@/app/api/_lib/services/macos-assistant.service";

const schema = z.object({
  languageHint: z.string().trim().optional(),
});

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  const audioFile = formData?.get("audio");

  if (!(audioFile instanceof File)) {
    return jsonError("audio file is required.", 400);
  }

  const parsed = schema.safeParse({
    languageHint: formData?.get("languageHint")?.toString(),
  });

  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid transcription request.", 400);
  }

  try {
    const result = await transcribeMacosAudio({
      audioFile,
      languageHint: parsed.data.languageHint,
    });
    return jsonOk(result);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Transcription failed.", 500);
  }
}
