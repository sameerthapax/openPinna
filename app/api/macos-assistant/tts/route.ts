import { jsonError } from "@/app/api/_lib/http";
import { synthesizeMacosSpeech } from "@/app/api/_lib/services/macos-assistant.service";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { text?: string } | null;
  const text = body?.text?.trim() || "";

  if (!text) {
    return jsonError("text is required.", 400);
  }

  try {
    const result = await synthesizeMacosSpeech(text);
    return new Response(result.bytes, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Speech synthesis failed.", 500);
  }
}
