export type OpenPinnaShortcutPreset =
  | "option-or-alt+p"
  | "mod+shift+p"
  | "mod+shift+n"
  | "manual";

export type OpenPinnaSettings = {
  overlayEnabled: boolean;
  voiceAgentFeatureEnabled: boolean;
  voiceMicActive: boolean;
  microphoneCaptureEnabled: boolean;
  lastSelectedProjectId: string;
  autoDetectSelection: boolean;
  darkMode: boolean;
  defaultTags: string[];
  backendApiUrl: string;
  backendVerified: boolean;
  openAiApiKey: string;
  openAiVerified: boolean;
  captureShortcut: OpenPinnaShortcutPreset;
};

export type OpenPinnaCaptureDraft = {
  projectId: string;
  sessionDate: string;
  pageTitle: string;
  pageUrl: string;
  selectedText: string;
  rawThought: string;
  tags: string[];
  sourceMetadata: Record<string, unknown>;
};

export type OpenPinnaProjectSummary = {
  id: string;
  title: string;
};

export type OpenPinnaBackendNote = {
  id: string;
  title: string;
  sourceUrl: string;
  sourceTitle: string | null;
  selectedText: string | null;
  rawThought: string;
  structuredSummary: string | null;
  usefulness: string | null;
  purpose: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type OpenPinnaBackgroundMessage =
  | { type: "SAVE_CAPTURED_NOTE"; note: OpenPinnaCaptureDraft }
  | { type: "LIST_CAPTURED_NOTES" }
  | { type: "LIST_PROJECTS" }
  | { type: "VERIFY_BACKEND"; backendApiUrl: string }
  | { type: "VERIFY_OPENAI"; apiKey: string }
  | { type: "CLEAR_CAPTURED_NOTES" }
  | { type: "DELETE_CAPTURED_NOTE"; id: string }
  | { type: "OPEN_OPTIONS" }
  | { type: "TOGGLE_OVERLAY" }
  | { type: "NOTE_SAVED"; note: OpenPinnaBackendNote }
  | {
      type: "VOICE_RECORDING_TOGGLE_ON";
      payload: {
        pageUrl: string;
        pageTitle: string;
        selectedText: string;
        sourceJson: Record<string, unknown>;
        startedAt: string;
        pinnaId?: string;
      };
    }
  | { type: "VOICE_RECORDING_TOGGLE_OFF" }
  | { type: "VOICE_SESSION_CREATE_REQUESTED" }
  | { type: "VOICE_SESSION_CREATED"; sessionId: string; audioId: string }
  | { type: "VOICE_RECORDING_START" }
  | { type: "VOICE_RECORDING_STARTED"; mimeType: string }
  | {
      type: "VOICE_RECORDING_CHUNK_READY";
      chunk: {
        chunkId: string;
        chunkIndex: number;
        mimeType: string;
        size: number;
        byteArray: number[];
      };
    }
  | {
      type: "VOICE_RECORDING_CHUNK_UPLOADED";
      chunk: {
        chunkId: string;
        chunkIndex: number;
        transcript?: string;
        status: "stored" | "transcribed" | "transcription_failed";
      };
    }
  | {
      type: "VOICE_RECORDING_CHUNK_UPLOAD_FAILED";
      chunk: {
        chunkId: string;
        chunkIndex: number;
        message: string;
      };
    }
  | { type: "VOICE_RECORDING_STOP" }
  | { type: "VOICE_RECORDING_STOPPED" }
  | { type: "VOICE_SESSION_FINALIZE_REQUESTED"; sessionId: string }
  | {
      type: "VOICE_SESSION_FINALIZED";
      sessionId: string;
      audioId: string;
      finalTranscript: string;
      noteId?: string;
    }
  | { type: "VOICE_RECORDING_ERROR"; error: { message: string; code?: string } }
  | { type: "VOICE_STATUS_EVENT"; message: string };

export type OpenPinnaBackgroundErrorCode =
  | "BACKEND_URL_MISSING"
  | "BACKEND_NOT_VERIFIED"
  | "OPENAI_NOT_VERIFIED"
  | "BACKEND_REQUEST_FAILED"
  | "NOT_FOUND";

export type OpenPinnaBackgroundResponse<T> =
  | {
      ok: true;
      handled: string;
      data: T;
    }
  | {
      ok: false;
      handled: string;
      code: OpenPinnaBackgroundErrorCode;
      message: string;
    };
