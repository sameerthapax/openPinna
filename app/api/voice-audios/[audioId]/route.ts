import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getVoiceUploadRoot } from "@/app/api/_lib/services/voice/voice-storage.service";

function guessContentType(filePath: string, mimeType?: string | null) {
  if (mimeType?.includes("mp4")) {
    return "audio/mp4";
  }

  if (mimeType?.includes("webm")) {
    return "audio/webm";
  }

  return filePath.endsWith(".mp4") ? "audio/mp4" : "audio/webm";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ audioId: string }> },
) {
  const { audioId } = await params;
  const voiceAudio = await db.voiceAudio.findUnique({
    where: { id: audioId },
    include: { session: true },
  });

  if (!voiceAudio?.fullAudioPath) {
    notFound();
  }

  const absolutePath = path.resolve(process.cwd(), voiceAudio.fullAudioPath);
  const voiceRoot = getVoiceUploadRoot();

  if (!absolutePath.startsWith(voiceRoot)) {
    notFound();
  }

  const bytes = await readFile(absolutePath).catch(() => null);

  if (!bytes) {
    notFound();
  }

  return new Response(bytes, {
    headers: {
      "Content-Type": guessContentType(absolutePath, voiceAudio.mimeType),
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
