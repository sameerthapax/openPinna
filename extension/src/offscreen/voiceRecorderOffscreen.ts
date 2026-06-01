import type { OpenPinnaBackgroundMessage } from "../lib/types";

let mediaStream: MediaStream | null = null;
let mediaRecorder: MediaRecorder | null = null;
let mediaMimeType = "";
let isRecording = false;
let nextChunkIndex = 0;
let chunkStopTimer: number | null = null;
let stopRequested = false;
const pendingChunkEmits = new Set<Promise<void>>();
const CHUNK_DURATION_MS = 5000;

function resolvePreferredMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  return MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "";
}

function stopAllTracks() {
  if (!mediaStream) {
    return;
  }

  for (const track of mediaStream.getTracks()) {
    try {
      track.stop();
    } catch {
      // Best effort cleanup.
    }
  }

  mediaStream = null;
}

function clearChunkStopTimer() {
  if (chunkStopTimer !== null) {
    window.clearTimeout(chunkStopTimer);
    chunkStopTimer = null;
  }
}

async function emitRecordingError(message: string, code?: string) {
  await chrome.runtime.sendMessage({
    type: "VOICE_RECORDING_ERROR",
    error: { message, code },
  } satisfies OpenPinnaBackgroundMessage);
}

async function emitChunk(blob: Blob) {
  if (!blob.size) {
    return;
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());

  await chrome.runtime.sendMessage({
    type: "VOICE_RECORDING_CHUNK_READY",
    chunk: {
      chunkId: crypto.randomUUID(),
      chunkIndex: nextChunkIndex,
      mimeType: blob.type || mediaMimeType || "audio/webm",
      size: blob.size,
      byteArray: Array.from(bytes),
    },
  } satisfies OpenPinnaBackgroundMessage);

  nextChunkIndex += 1;
}

async function finalizeStop() {
  clearChunkStopTimer();
  await Promise.allSettled(Array.from(pendingChunkEmits));
  stopAllTracks();
  mediaRecorder = null;
  mediaMimeType = "";
  isRecording = false;
  stopRequested = false;

  await chrome.runtime.sendMessage({ type: "VOICE_RECORDING_STOPPED" } satisfies OpenPinnaBackgroundMessage);
}

function scheduleChunkBoundary() {
  clearChunkStopTimer();
  chunkStopTimer = window.setTimeout(() => {
    if (!mediaRecorder || mediaRecorder.state !== "recording") {
      return;
    }

    try {
      mediaRecorder.stop();
    } catch (error) {
      void emitRecordingError(
        error instanceof Error ? error.message : "Could not stop chunk recorder.",
        "VOICE_CHUNK_ROTATE_FAILED",
      );
    }
  }, CHUNK_DURATION_MS);
}

function beginRecorderSegment() {
  if (!mediaStream) {
    throw new Error("Media stream is unavailable.");
  }

  mediaRecorder = mediaMimeType
    ? new MediaRecorder(mediaStream, { mimeType: mediaMimeType })
    : new MediaRecorder(mediaStream);

  mediaRecorder.ondataavailable = (event) => {
    const emitPromise = emitChunk(event.data).catch(async (error) => {
      const message = error instanceof Error ? error.message : "Could not emit recording chunk.";
      await emitRecordingError(message, "VOICE_CHUNK_EMIT_FAILED");
    });
    pendingChunkEmits.add(emitPromise);
    void emitPromise.finally(() => {
      pendingChunkEmits.delete(emitPromise);
    });
  };

  mediaRecorder.onerror = (event) => {
    const recorderError = event.error;
    const message = recorderError?.message || "Voice recorder encountered an error.";
    void emitRecordingError(message, recorderError?.name);
  };

  mediaRecorder.onstop = () => {
    clearChunkStopTimer();

    if (stopRequested) {
      void finalizeStop();
      return;
    }

    try {
      beginRecorderSegment();
    } catch (error) {
      void emitRecordingError(
        error instanceof Error ? error.message : "Could not restart recorder for next chunk.",
        "VOICE_CHUNK_RESTART_FAILED",
      );
    }
  };

  mediaRecorder.start();
  scheduleChunkBoundary();
}

async function startRecording() {
  if (isRecording) {
    await chrome.runtime.sendMessage({
      type: "VOICE_RECORDING_STARTED",
      mimeType: mediaMimeType || "audio/webm",
    } satisfies OpenPinnaBackgroundMessage);
    return;
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaMimeType = resolvePreferredMimeType();
    nextChunkIndex = 0;
    stopRequested = false;
    beginRecorderSegment();
    isRecording = true;
    const activeRecorder = mediaRecorder;

    await chrome.runtime.sendMessage({
      type: "VOICE_RECORDING_STARTED",
      mimeType: activeRecorder?.mimeType || mediaMimeType || "audio/webm",
    } satisfies OpenPinnaBackgroundMessage);
  } catch (error) {
    clearChunkStopTimer();
    stopAllTracks();
    mediaRecorder = null;
    mediaMimeType = "";
    isRecording = false;
    stopRequested = false;

    const message = error instanceof Error ? error.message : "Could not start microphone recording.";
    await emitRecordingError(message, "MIC_START_FAILED");
  }
}

async function stopRecording() {
  if (!isRecording) {
    clearChunkStopTimer();
    stopAllTracks();
    mediaRecorder = null;
    mediaMimeType = "";
    stopRequested = false;
    await chrome.runtime.sendMessage({ type: "VOICE_RECORDING_STOPPED" } satisfies OpenPinnaBackgroundMessage);
    return;
  }

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    stopRequested = true;
    mediaRecorder.stop();
    return;
  }

  clearChunkStopTimer();
  stopAllTracks();
  mediaRecorder = null;
  mediaMimeType = "";
  isRecording = false;
  stopRequested = false;
  await chrome.runtime.sendMessage({ type: "VOICE_RECORDING_STOPPED" } satisfies OpenPinnaBackgroundMessage);
}

chrome.runtime.onMessage.addListener((message: OpenPinnaBackgroundMessage, _sender, sendResponse) => {
  if (message.type === "VOICE_RECORDING_START") {
    void startRecording()
      .then(() => sendResponse({ ok: true }))
      .catch((error) =>
        sendResponse({ ok: false, message: error instanceof Error ? error.message : "Start failed." }),
      );
    return true;
  }

  if (message.type === "VOICE_RECORDING_STOP") {
    void stopRecording()
      .then(() => sendResponse({ ok: true }))
      .catch((error) =>
        sendResponse({ ok: false, message: error instanceof Error ? error.message : "Stop failed." }),
      );
    return true;
  }

  return false;
});
