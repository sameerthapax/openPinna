import type { OpenPinnaSettings } from "./types";

export const STORAGE_KEYS = {
  settings: "openpinna:settings",
} as const;

export const DEFAULT_SETTINGS: OpenPinnaSettings = {
  overlayEnabled: true,
  autoDetectSelection: true,
  darkMode: true,
  defaultTags: [],
  backendApiUrl: "",
  backendVerified: false,
  openAiApiKey: "",
  openAiVerified: false,
  captureShortcut: "option-or-alt+p",
};

export const OVERLAY_ROOT_ID = "openpinna-extension-root";
