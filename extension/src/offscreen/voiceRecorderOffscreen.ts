import type { OpenPinnaBackgroundMessage } from "../lib/types";

let mediaStream: MediaStream | null = null;
let mediaRecorder: MediaRecorder | null = null;
let mediaChunks: Blob[] = [];
let mediaMimeType = "";
let isRecording = false;

function resolvePreferredMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
    return "audio/webm;codecs=opus";
  }

  if (MediaRecorder.isTypeSupported("audio/webm")) {
    return "audio/webm";
  }

  return "";
}

async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Could not read audio blob."));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read blob."));
    reader.readAsDataURL(blob);
  });

  const commaIndex = dataUrl.indexOf(",");
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
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

async function emitRecordingError(message: string, code?: string) {
  await chrome.runtime.sendMessage({
    type: "VOICE_RECORDING_ERROR",
    error: { message, code },
  } satisfies OpenPinnaBackgroundMessage);
}

async function startRecording() {
  if (isRecording) {
    await chrome.runtime.sendMessage({ type: "VOICE_RECORDING_STARTED" } satisfies OpenPinnaBackgroundMessage);
    return;
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaMimeType = resolvePreferredMimeType();
    mediaChunks = [];

    mediaRecorder = mediaMimeType
      ? new MediaRecorder(mediaStream, { mimeType: mediaMimeType })
      : new MediaRecorder(mediaStream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        mediaChunks.push(event.data);
      }
    };

    mediaRecorder.onerror = (event) => {
      const recorderError = event.error;
      const message = recorderError?.message || "Voice recorder encountered an error.";
      void emitRecordingError(message, recorderError?.name);
    };

    mediaRecorder.onstop = () => {
      void (async () => {
        try {
          const audioBlob = new Blob(mediaChunks, { type: mediaMimeType || "audio/webm" });
          const base64 = await blobToBase64(audioBlob);

          await chrome.runtime.sendMessage({
            type: "VOICE_RECORDING_AUDIO_READY",
            audio: {
              mimeType: audioBlob.type,
              size: audioBlob.size,
              base64,
            },
          } satisfies OpenPinnaBackgroundMessage);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Could not package voice recording.";
          await emitRecordingError(message, "AUDIO_SERIALIZATION_FAILED");
        } finally {
          stopAllTracks();
          mediaRecorder = null;
          mediaChunks = [];
          mediaMimeType = "";
          isRecording = false;

          await chrome.runtime.sendMessage({ type: "VOICE_RECORDING_STOPPED" } satisfies OpenPinnaBackgroundMessage);
        }
      })();
    };

    mediaRecorder.start();
    isRecording = true;

    await chrome.runtime.sendMessage({ type: "VOICE_RECORDING_STARTED" } satisfies OpenPinnaBackgroundMessage);
  } catch (error) {
    stopAllTracks();
    mediaRecorder = null;
    mediaChunks = [];
    mediaMimeType = "";
    isRecording = false;

    const message = error instanceof Error ? error.message : "Could not start microphone recording.";
    await emitRecordingError(message, "MIC_START_FAILED");
  }
}

async function stopRecording() {
  if (!isRecording) {
    stopAllTracks();
    mediaRecorder = null;
    mediaChunks = [];
    mediaMimeType = "";
    await chrome.runtime.sendMessage({ type: "VOICE_RECORDING_STOPPED" } satisfies OpenPinnaBackgroundMessage);
    return;
  }

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    return;
  }

  stopAllTracks();
  mediaRecorder = null;
  mediaChunks = [];
  mediaMimeType = "";
  isRecording = false;
  await chrome.runtime.sendMessage({ type: "VOICE_RECORDING_STOPPED" } satisfies OpenPinnaBackgroundMessage);
}

chrome.runtime.onMessage.addListener((message: OpenPinnaBackgroundMessage, _sender, sendResponse) => {
  if (message.type === "START_VOICE_RECORDING") {
    void startRecording()
      .then(() => sendResponse({ ok: true }))
      .catch((error) =>
        sendResponse({ ok: false, message: error instanceof Error ? error.message : "Start failed." }),
      );
    return true;
  }

  if (message.type === "STOP_VOICE_RECORDING") {
    void stopRecording()
      .then(() => sendResponse({ ok: true }))
      .catch((error) =>
        sendResponse({ ok: false, message: error instanceof Error ? error.message : "Stop failed." }),
      );
    return true;
  }

  return false;
});
