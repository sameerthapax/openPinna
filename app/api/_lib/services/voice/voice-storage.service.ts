import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const voiceUploadRoot = path.resolve(process.env.VOICE_UPLOAD_DIR || "./audio");

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function extensionFromMimeType(mimeType: string) {
  if (mimeType.includes("png")) {
    return "png";
  }

  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) {
    return "jpg";
  }

  if (mimeType.includes("webp")) {
    return "webp";
  }

  if (mimeType.includes("webm")) {
    return "webm";
  }

  if (mimeType.includes("mp4")) {
    return "mp4";
  }

  return "bin";
}

function assertInsideVoiceRoot(targetPath: string) {
  const resolved = path.resolve(targetPath);

  if (!resolved.startsWith(voiceUploadRoot)) {
    throw new Error("VOICE_PATH_OUTSIDE_ROOT");
  }

  return resolved;
}

export function getVoiceUploadRoot() {
  return voiceUploadRoot;
}

export function getVoiceAudioDir(audioId: string) {
  return assertInsideVoiceRoot(path.join(voiceUploadRoot, safeSegment(audioId)));
}

export function getVoiceChunkDir(audioId: string) {
  return assertInsideVoiceRoot(path.join(getVoiceAudioDir(audioId), "chunks"));
}

export function getVoiceScreenshotDir(ownerId: string) {
  return assertInsideVoiceRoot(path.join(getVoiceAudioDir(ownerId), "screenshots"));
}

export function getVoiceScreenshotChunkDir(ownerId: string) {
  return assertInsideVoiceRoot(path.join(getVoiceScreenshotDir(ownerId), "chunks"));
}

export async function ensureVoiceAudioDirs(audioId: string) {
  await mkdir(getVoiceChunkDir(audioId), { recursive: true });
}

export async function ensureVoiceScreenshotDirs(ownerId: string) {
  await mkdir(getVoiceScreenshotChunkDir(ownerId), { recursive: true });
}

export function buildChunkFilename(chunkIndex: number, mimeType: string) {
  return `${chunkIndex}.${extensionFromMimeType(mimeType)}`;
}

export function buildChunkPath(audioId: string, chunkIndex: number, mimeType: string) {
  return assertInsideVoiceRoot(path.join(getVoiceChunkDir(audioId), buildChunkFilename(chunkIndex, mimeType)));
}

export function buildFullAudioPath(audioId: string, mimeType: string) {
  return assertInsideVoiceRoot(path.join(getVoiceAudioDir(audioId), `full.${extensionFromMimeType(mimeType)}`));
}

export function buildScreenshotChunkPath(ownerId: string, chunkIndex: number, mimeType: string) {
  return assertInsideVoiceRoot(
    path.join(getVoiceScreenshotChunkDir(ownerId), `${chunkIndex}.${extensionFromMimeType(mimeType)}`),
  );
}

export function buildScreenshotManifestPath(ownerId: string) {
  return assertInsideVoiceRoot(path.join(getVoiceScreenshotDir(ownerId), "manifest.json"));
}

export function buildScreenshotFullImagePath(ownerId: string) {
  return assertInsideVoiceRoot(path.join(getVoiceScreenshotDir(ownerId), "full.png"));
}

export function toVoiceRelativePath(absolutePath: string) {
  return path.relative(process.cwd(), absolutePath);
}

export async function writeVoiceChunkFile(input: {
  audioId: string;
  chunkIndex: number;
  mimeType: string;
  bytes: Buffer;
}) {
  await ensureVoiceAudioDirs(input.audioId);

  const filePath = buildChunkPath(input.audioId, input.chunkIndex, input.mimeType);
  await writeFile(filePath, input.bytes);
  const fileStats = await stat(filePath);

  return {
    filePath,
    relativePath: toVoiceRelativePath(filePath),
    sizeBytes: fileStats.size,
  };
}

export async function writeVoiceScreenshotChunkFile(input: {
  ownerId: string;
  chunkIndex: number;
  mimeType: string;
  bytes: Buffer;
}) {
  await ensureVoiceScreenshotDirs(input.ownerId);

  const filePath = buildScreenshotChunkPath(input.ownerId, input.chunkIndex, input.mimeType);
  await writeFile(filePath, input.bytes);
  const fileStats = await stat(filePath);

  return {
    filePath,
    relativePath: toVoiceRelativePath(filePath),
    sizeBytes: fileStats.size,
  };
}

export async function writeVoiceScreenshotManifestFile(input: {
  ownerId: string;
  manifest: Record<string, unknown>;
}) {
  await ensureVoiceScreenshotDirs(input.ownerId);

  const filePath = buildScreenshotManifestPath(input.ownerId);
  await writeFile(filePath, JSON.stringify(input.manifest, null, 2), "utf8");

  return {
    filePath,
    relativePath: toVoiceRelativePath(filePath),
  };
}

export async function writeVoiceScreenshotFullImageFile(input: {
  ownerId: string;
  bytes: Buffer;
}) {
  await ensureVoiceScreenshotDirs(input.ownerId);

  const filePath = buildScreenshotFullImagePath(input.ownerId);
  await writeFile(filePath, input.bytes);
  const fileStats = await stat(filePath);

  return {
    filePath,
    relativePath: toVoiceRelativePath(filePath),
    sizeBytes: fileStats.size,
  };
}

// Container-safe merge should use ffmpeg. Ordered binary concatenation remains as the MVP fallback.
export async function concatenateVoiceChunks(outputPath: string, chunkPaths: string[]) {
  const buffers = await Promise.all(chunkPaths.map((chunkPath) => readFile(chunkPath)));
  await writeFile(outputPath, Buffer.concat(buffers));
  return outputPath;
}
