import { useEffect, useState } from "react";
import { ResetIcon, TrashIcon } from "@radix-ui/react-icons";
import { Button } from "../components/Button";
import { GlassPanel } from "../components/GlassPanel";
import { TextInput } from "../components/TextInput";
import { Toggle } from "../components/Toggle";
import {
  getSettings,
  resetSettings,
  saveSettings,
  subscribeToSettings,
} from "../lib/chrome-storage";
import { BackendUrlMissingError, clearCapturedNotes } from "../lib/backend";
import type { OpenPinnaSettings } from "../lib/types";
import { parseTags } from "../lib/utils";

export function OptionsApp() {
  const [settings, setSettings] = useState<OpenPinnaSettings | null>(null);
  const [defaultTags, setDefaultTags] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    getSettings().then((nextSettings) => {
      setSettings(nextSettings);
      setDefaultTags(nextSettings.defaultTags.join(", "));
    });

    return subscribeToSettings((nextSettings) => {
      setSettings(nextSettings);
      setDefaultTags(nextSettings.defaultTags.join(", "));
    });
  }, []);

  if (!settings) {
    return (
      <main className="op-shell min-h-[100dvh] p-6">
        <GlassPanel className="mx-auto mt-16 max-w-3xl">
          <div className="h-6 w-40 animate-pulse rounded-[6px] bg-white/10" />
          <div className="mt-5 h-24 animate-pulse rounded-[12px] bg-white/8" />
        </GlassPanel>
      </main>
    );
  }

  function updateSetting<K extends keyof OpenPinnaSettings>(
    key: K,
    value: OpenPinnaSettings[K],
  ) {
    setSettings((current) => {
      if (!current) {
        return current;
      }

      return { ...current, [key]: value };
    });
  }

  async function handleSave() {
    if (!settings) {
      return;
    }

    const nextSettings: OpenPinnaSettings = {
      ...settings,
      defaultTags: parseTags(defaultTags),
    };

    await saveSettings(nextSettings);
    setSettings(nextSettings);
    setStatus("Settings saved locally.");
  }

  async function handleReset() {
    const nextSettings = await resetSettings();
    setSettings(nextSettings);
    setDefaultTags(nextSettings.defaultTags.join(", "));
    setStatus("Settings reset.");
  }

  async function handleClearNotes() {
    try {
      await clearCapturedNotes();
      setStatus("Synced notes cleared from the backend.");
    } catch (error) {
      if (error instanceof BackendUrlMissingError) {
        setStatus("Add a backend API URL before clearing notes.");
        return;
      }

      setStatus(error instanceof Error ? error.message : "Could not clear notes.");
    }
  }

  return (
    <main
      data-theme={settings.darkMode ? "dark" : "light"}
      className="op-shell min-h-[100dvh] px-5 py-10 md:px-8"
    >
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[0.76fr_1.24fr]">
        <aside className="space-y-5 pt-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 overflow-hidden rounded-[14px] border border-[var(--op-border)] bg-[var(--op-soft)]">
              <img
                src={chrome.runtime.getURL("icons/openPinnaLogo.png")}
                alt=""
                aria-hidden="true"
                className="h-full w-full object-cover"
              />
            </span>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--op-muted)]">
              Extension settings
            </p>
          </div>
          <h1 className="max-w-[8ch] text-5xl font-semibold leading-[0.92] tracking-[-0.07em] text-[var(--op-text)] md:text-6xl">
            openPinna capture preferences
          </h1>
          <p className="max-w-[58ch] text-sm leading-7 text-[var(--op-muted)]">
            Keep the browser overlay quiet, useful, and local-first for
            settings. Notes sync through the backend route you configure here.
          </p>
        </aside>

        <GlassPanel theme={settings.darkMode ? "dark" : "light"} className="space-y-6">
          <section>
            <Toggle
              label="Enable floating overlay"
              description="Show the capture bubble on supported web pages."
              checked={settings.overlayEnabled}
              onChange={(value) => updateSetting("overlayEnabled", value)}
              theme={settings.darkMode ? "dark" : "light"}
            />
            <Toggle
              label="Auto-detect selected text"
              description="Refresh highlighted text while you read."
              checked={settings.autoDetectSelection}
              onChange={(value) => updateSetting("autoDetectSelection", value)}
              theme={settings.darkMode ? "dark" : "light"}
            />
            <Toggle
              label="Dark mode"
              description="Switch the extension shell between dark and light surfaces."
              checked={settings.darkMode}
              onChange={(value) => {
                updateSetting("darkMode", value);
              }}
              theme={settings.darkMode ? "dark" : "light"}
            />
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <TextInput
              label="Default tags"
              value={defaultTags}
              placeholder="literature, methods"
              helper="Comma-separated tags applied to new captures."
              onChange={(event) => setDefaultTags(event.target.value)}
              theme={settings.darkMode ? "dark" : "light"}
            />
            <TextInput
              label="Backend API URL"
              value={settings.backendApiUrl}
              placeholder="http://localhost:3000"
              helper="Required for note sync. Settings themselves stay in Chrome storage."
              onChange={(event) =>
                updateSetting("backendApiUrl", event.target.value)
              }
              theme={settings.darkMode ? "dark" : "light"}
            />
            <label className="grid gap-2 md:col-span-2">
              <span className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--op-muted)]">
                Overlay shortcut
              </span>
              <select
                className="h-10 rounded-[10px] border border-[var(--op-border)] bg-[var(--op-soft)] px-3 text-sm text-[var(--op-text)] outline-none transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-[var(--op-border-strong)] focus:bg-[var(--op-soft-strong)]"
                value={settings.captureShortcut}
                onChange={(event) =>
                  updateSetting("captureShortcut", event.target.value)
                }
              >
                <option value="mod+shift+p">Command/Ctrl Shift P</option>
                <option value="mod+shift+n">Command/Ctrl Shift N</option>
                <option value="manual">Manual only</option>
              </select>
              <span className="text-xs leading-5 text-[var(--op-muted)]">
                The keyboard command toggles the floating overlay. Update the
                shortcut in Chrome&apos;s extensions shortcuts if you want a
                different key combo.
              </span>
            </label>
          </section>

          <section className="flex flex-col gap-3 border-t border-[var(--op-border)] pt-5 md:flex-row md:items-center md:justify-between">
            <p className="min-h-5 text-sm text-[var(--op-accent-text)]">{status}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="danger"
                theme={settings.darkMode ? "dark" : "light"}
                onClick={handleClearNotes}
              >
                <TrashIcon />
                Clear notes
              </Button>
              <Button
                variant="secondary"
                theme={settings.darkMode ? "dark" : "light"}
                onClick={handleReset}
              >
                <ResetIcon />
                Reset
              </Button>
              <Button theme={settings.darkMode ? "dark" : "light"} onClick={handleSave}>
                Save settings
              </Button>
            </div>
          </section>
        </GlassPanel>
      </div>
    </main>
  );
}
