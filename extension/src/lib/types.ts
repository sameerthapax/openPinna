export type OpenPinnaSettings = {
  overlayEnabled: boolean;
  autoDetectSelection: boolean;
  darkMode: boolean;
  defaultTags: string[];
  backendApiUrl: string;
  backendVerified: boolean;
  openAiApiKey: string;
  openAiVerified: boolean;
  captureShortcut: string;
};

export type OpenPinnaCaptureDraft = {
  projectId: string;
  sessionDate: string;
  pageTitle: string;
  pageUrl: string;
  selectedText: string;
  rawThought: string;
  tags: string[];
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
  | { type: "NOTE_SAVED"; note: OpenPinnaBackendNote };

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
