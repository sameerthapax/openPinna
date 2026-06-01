import { DEFAULT_SETTINGS, STORAGE_KEYS } from "./constants";
import type { OpenPinnaSettings } from "./types";

function normalizeCaptureShortcut(value: unknown): OpenPinnaSettings["captureShortcut"] {
  if (value === "alt-or-command+p") {
    return "option-or-alt+p";
  }
  if (value === "option-or-alt+p" || value === "mod+shift+p" || value === "mod+shift+n" || value === "manual") {
    return value;
  }
  return DEFAULT_SETTINGS.captureShortcut;
}

function normalizeSettings(
  settings?: Partial<OpenPinnaSettings> | null,
): OpenPinnaSettings {
  const legacyMicPermissionValue =
    typeof (settings as { micPermissionGranted?: unknown } | null)?.micPermissionGranted === "boolean"
      ? Boolean((settings as { micPermissionGranted?: unknown }).micPermissionGranted)
      : DEFAULT_SETTINGS.microphoneCaptureEnabled;
  const legacyVoiceEnabledValue =
    typeof (settings as { voiceAgentEnabled?: unknown } | null)?.voiceAgentEnabled === "boolean"
      ? Boolean((settings as { voiceAgentEnabled?: unknown }).voiceAgentEnabled)
      : DEFAULT_SETTINGS.voiceAgentFeatureEnabled;

  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    defaultTags: settings?.defaultTags ?? DEFAULT_SETTINGS.defaultTags,
    captureShortcut: normalizeCaptureShortcut(settings?.captureShortcut),
    microphoneCaptureEnabled:
      typeof settings?.microphoneCaptureEnabled === "boolean"
        ? settings.microphoneCaptureEnabled
        : legacyMicPermissionValue,
    voiceAgentFeatureEnabled:
      typeof settings?.voiceAgentFeatureEnabled === "boolean"
        ? settings.voiceAgentFeatureEnabled
        : legacyVoiceEnabledValue,
    voiceMicActive:
      typeof settings?.voiceMicActive === "boolean"
        ? settings.voiceMicActive
        : false,
  };
}

function storageGet<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(result[key] as T | undefined);
    });
  });
}

function storageSet<T>(key: string, value: T): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => resolve());
  });
}

export async function getSettings(): Promise<OpenPinnaSettings> {
  const saved = await storageGet<Partial<OpenPinnaSettings>>(
    STORAGE_KEYS.settings,
  );

  return normalizeSettings(saved);
}

export async function saveSettings(settings: OpenPinnaSettings): Promise<void> {
  await storageSet(STORAGE_KEYS.settings, normalizeSettings(settings));
}

export async function resetSettings(): Promise<OpenPinnaSettings> {
  await saveSettings(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

export async function updateSettings(
  patch: Partial<OpenPinnaSettings>,
): Promise<OpenPinnaSettings> {
  const current = await getSettings();
  const next = normalizeSettings({
    ...current,
    ...patch,
    defaultTags: patch.defaultTags ?? current.defaultTags,
  });

  await saveSettings(next);
  return next;
}

export function subscribeToSettings(
  onChange: (settings: OpenPinnaSettings) => void,
) {
  const listener: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (
    changes,
    areaName,
  ) => {
    if (areaName !== "local") {
      return;
    }

    const next = changes[STORAGE_KEYS.settings]?.newValue as
      | Partial<OpenPinnaSettings>
      | undefined;

    if (!next) {
      onChange(DEFAULT_SETTINGS);
      return;
    }

    onChange(normalizeSettings(next));
  };

  chrome.storage.onChanged.addListener(listener);

  return () => chrome.storage.onChanged.removeListener(listener);
}
