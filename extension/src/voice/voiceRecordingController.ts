import { updateSettings } from "../lib/chrome-storage";
import type { OpenPinnaBackgroundMessage } from "../lib/types";
import {
  createVoiceSessionRequest,
  finalizeVoiceSessionRequest,
  updateVoiceSessionRequest,
  uploadVoiceChunkRequest,
} from "./voiceSessionClient";

export type VoiceRecordingStartPayload = {
  projectId: string;
  pinnaId?: string;
  sourceJson: Record<string, unknown>;
  selectedText: string;
  pageUrl: string;
  pageTitle: string;
  startedAt: string;
};

type VoiceRuntimeState = {
  activeTabId?: number;
  activeVoiceSessionId?: string;
  activeAudioId?: string;
  chunkIndex: number;
  isRecording: boolean;
  isStopping: boolean;
  pendingUploads: Map<number, Promise<void>>;
  failedChunks: Map<number, string>;
  projectId?: string;
  pinnaId?: string;
  sourceJson?: Record<string, unknown>;
  selectedText?: string;
  pageUrl?: string;
  pageTitle?: string;
  startedAt?: string;
  mimeType?: string;
  lastFinalizeFailureSessionId?: string;
};

type VoiceControllerDeps = {
  ensureOffscreen: () => Promise<void>;
  closeOffscreen: () => Promise<void>;
  setVoiceRecordingActive: (nextValue: boolean) => Promise<void>;
};

function createInitialState(): VoiceRuntimeState {
  return {
    chunkIndex: 0,
    isRecording: false,
    isStopping: false,
    pendingUploads: new Map(),
    failedChunks: new Map(),
  };
}

export function createVoiceRecordingController(deps: VoiceControllerDeps) {
  let state = createInitialState();

  function logState(label: string) {
    console.info("[openPinna][voice] controller", {
      label,
      sessionId: state.activeVoiceSessionId || null,
      audioId: state.activeAudioId || null,
      isRecording: state.isRecording,
      isStopping: state.isStopping,
      pendingUploadCount: state.pendingUploads.size,
      failedChunkIndexes: Array.from(state.failedChunks.keys()),
      chunkIndex: state.chunkIndex,
    });
  }

  async function notifyTab(message: OpenPinnaBackgroundMessage) {
    if (!state.activeTabId) {
      return;
    }

    try {
      await chrome.tabs.sendMessage(state.activeTabId, message);
    } catch {
      // Best effort UI status propagation.
    }
  }

  async function broadcastStatus(message: string) {
    await notifyTab({ type: "VOICE_STATUS_EVENT", message });
  }

  async function cleanupRecordingState(options?: { preserveSessionIds?: boolean }) {
    logState("cleanup-start");
    await deps.setVoiceRecordingActive(false);
    await updateSettings({ voiceMicActive: false });
    await deps.closeOffscreen().catch(() => {});

    const preserved = options?.preserveSessionIds
      ? {
          activeVoiceSessionId: state.activeVoiceSessionId,
          activeAudioId: state.activeAudioId,
          lastFinalizeFailureSessionId: state.activeVoiceSessionId,
        }
      : {};

    state = {
      ...createInitialState(),
      ...preserved,
    };
    logState("cleanup-complete");
  }

  async function start(payload: VoiceRecordingStartPayload, activeTabId?: number) {
    console.info("[openPinna][voice] controller start requested", {
      activeTabId: activeTabId || null,
      projectId: payload.projectId,
      pageUrl: payload.pageUrl,
      startedAt: payload.startedAt,
    });
    if (state.isRecording || state.activeVoiceSessionId) {
      logState("start-skipped-already-active");
      return {
        active: true,
        sessionId: state.activeVoiceSessionId,
        audioId: state.activeAudioId,
      };
    }

    state.activeTabId = activeTabId;
    state.projectId = payload.projectId;
    state.pinnaId = payload.pinnaId;
    state.sourceJson = payload.sourceJson;
    state.selectedText = payload.selectedText;
    state.pageUrl = payload.pageUrl;
    state.pageTitle = payload.pageTitle;
    state.startedAt = payload.startedAt;

    await notifyTab({ type: "VOICE_SESSION_CREATE_REQUESTED" });
    await broadcastStatus("Starting voice session…");

    try {
      const session = await createVoiceSessionRequest(payload);
      state.activeVoiceSessionId = session.sessionId;
      state.activeAudioId = session.audioId;
      state.chunkIndex = 0;
      state.failedChunks.clear();
      state.pendingUploads.clear();
      logState("session-created");

      await notifyTab({ type: "VOICE_SESSION_CREATED", sessionId: session.sessionId, audioId: session.audioId });
      await deps.ensureOffscreen();
      await deps.setVoiceRecordingActive(true);
      await updateSettings({ voiceMicActive: true });
      await chrome.runtime.sendMessage({ type: "VOICE_RECORDING_START" } satisfies OpenPinnaBackgroundMessage);
      logState("recording-start-sent");
    } catch (error) {
      state = createInitialState();
      console.error("[openPinna][voice] controller start failed", {
        message: error instanceof Error ? error.message : "Unknown start error.",
      });
      throw error;
    }

    return {
      active: true,
      sessionId: state.activeVoiceSessionId,
      audioId: state.activeAudioId,
    };
  }

  async function updateSourceJson(sourceJson: Record<string, unknown>, expectedSessionId?: string) {
    if (!state.activeVoiceSessionId || !state.sourceJson) {
      return { updated: false };
    }

    if (expectedSessionId && state.activeVoiceSessionId !== expectedSessionId) {
      return { updated: false };
    }

    state.sourceJson = sourceJson;

    try {
      await updateVoiceSessionRequest({
        sessionId: state.activeVoiceSessionId,
        sourceJson,
      });
    } catch (error) {
      console.warn("[openPinna][voice] could not persist session source metadata update", {
        sessionId: state.activeVoiceSessionId,
        message: error instanceof Error ? error.message : "Unknown session update error.",
      });
      throw error;
    }

    return { updated: true, sessionId: state.activeVoiceSessionId };
  }

  async function stop() {
    state.isStopping = true;
    logState("stop-requested");
    await chrome.runtime.sendMessage({ type: "VOICE_RECORDING_STOP" } satisfies OpenPinnaBackgroundMessage);
    return { active: false };
  }

  async function onRecordingStarted(mimeType: string) {
    state.isRecording = true;
    state.mimeType = mimeType;
    logState("recording-started");
    await notifyTab({ type: "VOICE_RECORDING_STARTED", mimeType });
    await broadcastStatus("Recording…");
  }

  async function onChunkReady(chunk: {
    chunkId: string;
    chunkIndex: number;
    mimeType: string;
    size: number;
    byteArray: number[];
  }) {
    if (!state.activeVoiceSessionId || !state.activeAudioId || !state.projectId || !state.sourceJson || !state.pageUrl || !state.pageTitle || !state.startedAt) {
      console.warn("[openPinna][voice] chunk dropped: incomplete controller state", {
        chunkId: chunk.chunkId,
        chunkIndex: chunk.chunkIndex,
      });
      return;
    }

    console.info("[openPinna][voice] chunk ready", {
      sessionId: state.activeVoiceSessionId,
      audioId: state.activeAudioId,
      chunkId: chunk.chunkId,
      chunkIndex: chunk.chunkIndex,
      size: chunk.size,
    });

    const blob = new Blob([Uint8Array.from(chunk.byteArray)], { type: chunk.mimeType || "audio/webm" });

    const uploadPromise = (async () => {
      try {
        const result = await uploadVoiceChunkRequest({
          sessionId: state.activeVoiceSessionId!,
          audioId: state.activeAudioId!,
          chunkId: chunk.chunkId,
          chunkIndex: chunk.chunkIndex,
          mimeType: chunk.mimeType,
          blob,
          sourceJson: state.sourceJson!,
          selectedText: state.selectedText || "",
          projectId: state.projectId!,
          pinnaId: state.pinnaId,
          pageUrl: state.pageUrl!,
          pageTitle: state.pageTitle!,
          startedAt: state.startedAt!,
        });

        state.failedChunks.delete(chunk.chunkIndex);
        await notifyTab({
          type: "VOICE_RECORDING_CHUNK_UPLOADED",
          chunk: {
            chunkId: result.chunkId,
            chunkIndex: result.chunkIndex,
            transcript: result.transcript,
            status: result.status,
          },
        });

        const chunkNumber = result.chunkIndex + 1;
        await broadcastStatus(
          result.status === "transcribed"
            ? `Uploaded chunk ${chunkNumber}`
            : result.status === "transcription_failed"
              ? `Chunk ${chunkNumber} saved, transcription failed`
              : `Uploaded chunk ${chunkNumber}`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Chunk upload failed.";
        state.failedChunks.set(chunk.chunkIndex, message);
        await notifyTab({
          type: "VOICE_RECORDING_CHUNK_UPLOAD_FAILED",
          chunk: {
            chunkId: chunk.chunkId,
            chunkIndex: chunk.chunkIndex,
            message,
          },
        });
        await broadcastStatus(`Chunk ${chunk.chunkIndex + 1} upload failed`);
      } finally {
        state.pendingUploads.delete(chunk.chunkIndex);
        logState(`chunk-settled-${chunk.chunkIndex}`);
      }
    })();

    state.pendingUploads.set(chunk.chunkIndex, uploadPromise);
    state.chunkIndex = Math.max(state.chunkIndex, chunk.chunkIndex + 1);
    logState(`chunk-enqueued-${chunk.chunkIndex}`);
  }

  async function onRecordingStopped() {
    state.isRecording = false;
    logState("recording-stopped");
    await notifyTab({ type: "VOICE_RECORDING_STOPPED" });

    const pendingUploads = Array.from(state.pendingUploads.values());
    if (pendingUploads.length > 0) {
      console.info("[openPinna][voice] waiting for pending uploads before finalize", {
        sessionId: state.activeVoiceSessionId || null,
        pendingUploadCount: pendingUploads.length,
      });
      await broadcastStatus("Processing voice…");
      await Promise.allSettled(pendingUploads);
    }

    if (state.chunkIndex === 0) {
      console.warn("[openPinna][voice] finalize skipped: no chunks captured", {
        sessionId: state.activeVoiceSessionId || null,
      });
      await notifyTab({
        type: "VOICE_RECORDING_ERROR",
        error: {
          message: "No audio chunk was captured. Hold recording a bit longer before stopping.",
          code: "VOICE_NO_CHUNKS_CAPTURED",
        },
      });
      await cleanupRecordingState({ preserveSessionIds: Boolean(state.activeVoiceSessionId) });
      return;
    }

    if (!state.activeVoiceSessionId) {
      await cleanupRecordingState();
      return;
    }

    await notifyTab({ type: "VOICE_SESSION_FINALIZE_REQUESTED", sessionId: state.activeVoiceSessionId });
    await broadcastStatus("Processing voice…");
    logState("finalize-requested");

    try {
      const result = await finalizeVoiceSessionRequest(state.activeVoiceSessionId);
      await notifyTab({
        type: "VOICE_SESSION_FINALIZED",
        sessionId: result.sessionId,
        audioId: result.audioId,
        finalTranscript: result.finalTranscript,
        noteId: result.noteId,
      });
      await broadcastStatus("Saved voice note");
      console.info("[openPinna][voice] finalize succeeded", {
        sessionId: result.sessionId,
        audioId: result.audioId,
        noteId: result.noteId || null,
      });
      await cleanupRecordingState();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not finalize voice session.";
      console.error("[openPinna][voice] finalize failed", {
        sessionId: state.activeVoiceSessionId || null,
        message,
      });
      await notifyTab({ type: "VOICE_RECORDING_ERROR", error: { message, code: "VOICE_FINALIZE_FAILED" } });
      await broadcastStatus(`Voice finalize failed. Session ${state.activeVoiceSessionId}`);
      await cleanupRecordingState({ preserveSessionIds: true });
    }
  }

  async function onRecordingError(error: { message: string; code?: string }) {
    console.error("[openPinna][voice] recorder error", error);
    await notifyTab({ type: "VOICE_RECORDING_ERROR", error });
    await cleanupRecordingState({ preserveSessionIds: Boolean(state.activeVoiceSessionId) });
  }

  function getState() {
    return state;
  }

  return {
    start,
    stop,
    updateSourceJson,
    onRecordingStarted,
    onChunkReady,
    onRecordingStopped,
    onRecordingError,
    getState,
  };
}
