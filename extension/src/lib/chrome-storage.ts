import { DEFAULT_SETTINGS, STORAGE_KEYS } from "./constants";
import type { OpenPinnaSettings } from "./types";

function normalizeSettings(
  settings?: Partial<OpenPinnaSettings> | null,
): OpenPinnaSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    defaultTags: settings?.defaultTags ?? DEFAULT_SETTINGS.defaultTags,
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
