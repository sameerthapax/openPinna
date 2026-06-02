import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { buildFullAudioPath, concatenateVoiceChunks, ensureVoiceAudioDirs } from "./voice-storage.service";

const execFileAsync = promisify(execFile);

async function combineWithFfmpeg(outputPath: string, chunkPaths: string[]) {
  const listPath = path.join(path.dirname(outputPath), "concat.txt");
  const listContent = chunkPaths
    .map((chunkPath) => `file '${chunkPath.replace(/'/g, "'\\''")}'`)
    .join("\n");

  await writeFile(listPath, listContent);

  await execFileAsync("ffmpeg", [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-c",
    "copy",
    outputPath,
  ]);

  return outputPath;
}

export async function combineAudioChunks(audioId: string, chunkPaths: string[], mimeType: string) {
  await ensureVoiceAudioDirs(audioId);
  const outputPath = buildFullAudioPath(audioId, mimeType);

  if (chunkPaths.length === 0) {
    throw new Error("VOICE_NO_CHUNKS_TO_COMBINE");
  }

  try {
    return await combineWithFfmpeg(outputPath, chunkPaths);
  } catch {
    await concatenateVoiceChunks(outputPath, chunkPaths);
    return outputPath;
  }
}
