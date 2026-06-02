export type OpenPinnaShortcutPreset =
  | "option-or-alt+p"
  | "mod+shift+p"
  | "mod+shift+n"
  | "manual";

export type ArtifactType = "screenshot" | "pdf";
export type CaptureMode = "viewport-screenshot" | "page-screenshot" | "pdf-download";

export interface CaptureArtifact {
  id: string;
  artifactType: ArtifactType;
  captureMode: CaptureMode;
  mimeType: string;
  storagePath: string;
  originalUrl: string;
  title?: string;
  fileName?: string;
  createdAt: string;
}

export type OpenPinnaSettings = {
  overlayEnabled: boolean;
  voiceAgentFeatureEnabled: boolean;
  voiceMicActive: boolean;
  microphoneCaptureEnabled: boolean;
  lastSelectedProjectId: string;
  cachedProjects: OpenPinnaProjectSummary[];
  autoDetectSelection: boolean;
  darkMode: boolean;
  defaultTags: string[];
  backendApiUrl: string;
  backendVerified: boolean;
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

export type OpenPinnaPageCaptureMetrics = {
  targetId: string;
  targetKind: "window" | "element";
  originalScrollLeft: number;
  originalScrollTop: number;
  scrollY: number;
  viewportWidth: number;
  viewportHeight: number;
  documentHeight: number;
  devicePixelRatio: number;
};

export type OpenPinnaScreenshotChunkMetadata = {
  screenshotId: string;
  voiceSessionId: string;
  audioId?: string;
  chunkId: string;
  chunkIndex: number;
  pageUrl: string;
  pageTitle: string;
  scrollY: number;
  viewportWidth: number;
  viewportHeight: number;
  documentHeight: number;
  devicePixelRatio: number;
  capturedAt: string;
  projectId?: string;
  pinnaId?: string;
  sourceJson?: Record<string, unknown>;
  selectedText?: string;
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
  | { type: "VERIFY_VOICE_AGENT_BACKEND" }
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
  | { type: "SCREENSHOT_SESSION_START_REQUESTED"; voiceSessionId: string }
  | { type: "SCREENSHOT_SESSION_STARTED"; voiceSessionId: string; screenshotId: string }
  | { type: "SCREENSHOT_CAPTURE_MEASURE_PAGE" }
  | { type: "SCREENSHOT_CAPTURE_PAGE_MEASURED"; metrics: OpenPinnaPageCaptureMetrics }
  | { type: "SCREENSHOT_CAPTURE_SCROLL_TO"; targetId: string; scrollY: number }
  | { type: "SCREENSHOT_CAPTURE_SCROLLED"; targetId: string; scrollY: number }
  | { type: "SCREENSHOT_CAPTURE_RESTORE_SCROLL"; targetId: string; scrollY: number; left: number }
  | { type: "SCREENSHOT_CHUNK_CAPTURED"; metadata: OpenPinnaScreenshotChunkMetadata }
  | { type: "SCREENSHOT_CHUNK_UPLOAD_REQUESTED"; metadata: OpenPinnaScreenshotChunkMetadata }
  | {
      type: "SCREENSHOT_CHUNK_UPLOADED";
      metadata: OpenPinnaScreenshotChunkMetadata;
      filePath: string;
      status: "stored";
    }
  | {
      type: "SCREENSHOT_CHUNK_UPLOAD_FAILED";
      metadata: Pick<OpenPinnaScreenshotChunkMetadata, "voiceSessionId" | "chunkId" | "chunkIndex">;
      message: string;
    }
  | { type: "SCREENSHOT_SESSION_FINALIZE_REQUESTED"; voiceSessionId: string; screenshotId: string }
  | {
      type: "SCREENSHOT_SESSION_FINALIZED";
      voiceSessionId: string;
      screenshotId: string;
      chunkCount: number;
      manifestPath: string;
    }
  | { type: "SCREENSHOT_SESSION_CANCEL_REQUESTED"; voiceSessionId: string; screenshotId?: string }
  | { type: "SCREENSHOT_SESSION_CANCELLED"; voiceSessionId: string; screenshotId?: string }
  | { type: "SCREENSHOT_SESSION_ERROR"; voiceSessionId: string; message: string; screenshotId?: string }
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
