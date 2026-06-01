import type { OpenPinnaSettings } from "./types";

export const STORAGE_KEYS = {
  settings: "openpinna:settings",
} as const;

export const DEFAULT_SETTINGS: OpenPinnaSettings = {
  overlayEnabled: true,
  voiceAgentFeatureEnabled: false,
  voiceMicActive: false,
  microphoneCaptureEnabled: false,
  lastSelectedProjectId: "",
  cachedProjects: [],
  autoDetectSelection: true,
  darkMode: true,
  defaultTags: [],
  backendApiUrl: "",
  backendVerified: false,
  captureShortcut: "option-or-alt+p",
};

export const OVERLAY_ROOT_ID = "openpinna-extension-root";
