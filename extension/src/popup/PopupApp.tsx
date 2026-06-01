import { useEffect, useState } from "react";
import {
  GearIcon,
  OpenInNewWindowIcon,
  PlusCircledIcon,
  Cross2Icon,
  CheckIcon,
} from "@radix-ui/react-icons";
import { Button } from "../components/Button";
import { GlassPanel } from "../components/GlassPanel";
import {
  getSettings,
  subscribeToSettings,
  updateSettings,
} from "../lib/chrome-storage";
import {
  listCapturedNotes,
  BackendUrlMissingError,
} from "../lib/backend";
import type { OpenPinnaBackendNote, OpenPinnaSettings } from "../lib/types";
import { formatRelativeDate } from "../lib/utils";

export function PopupApp() {
  const [settings, setSettings] = useState<OpenPinnaSettings | null>(null);
  const [lastNote, setLastNote] = useState<OpenPinnaBackendNote | null>(null);
  const [status, setStatus] = useState("");
  const logoUrl = chrome.runtime.getURL("icons/openPinnaLogo.png");

  useEffect(() => {
    async function loadPopupState() {
      const nextSettings = await getSettings();
      setSettings(nextSettings);

      if (!nextSettings.backendApiUrl.trim() || !nextSettings.backendVerified) {
        setStatus("Verify backend in Settings to sync notes.");
        setLastNote(null);
        return;
      }

      try {
        const notes = await listCapturedNotes();
        setLastNote(notes[0] ?? null);
        setStatus(notes.length ? "Connected." : "No synced notes yet.");
      } catch (error) {
        if (error instanceof BackendUrlMissingError) {
          setStatus("Verify backend in Settings to sync notes.");
        } else {
          setStatus(
            error instanceof Error ? error.message : "Could not load notes.",
          );
        }
      }
    }

    loadPopupState();

    return subscribeToSettings((nextSettings) => {
      setSettings(nextSettings);
    });
  }, []);

  function openOptions() {
    chrome.runtime.openOptionsPage();
  }

  async function toggleOverlay() {
    if (!settings) {
      return;
    }

    const nextSettings = await updateSettings({
      overlayEnabled: !settings.overlayEnabled,
    });

    setSettings(nextSettings);
  }

  return (
    <main
      data-theme={settings?.darkMode ? "dark" : "light"}
      className="op-shell w-[392px] p-2"
    >
      <GlassPanel
        theme={settings?.darkMode ? "dark" : "light"}
        className="space-y-5"
      >
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[14px] border border-[var(--op-border)] bg-[var(--op-soft)]">
              <img
                src={logoUrl}
                alt=""
                aria-hidden="true"
                className="h-full w-full object-cover"
              />
            </span>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--op-muted)]">
                Research capture
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--op-text)]">
                openPinna
              </h1>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleOverlay}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] ${
              settings?.overlayEnabled
                ? "border-[rgba(237,243,236,0.24)] bg-[rgba(237,243,236,0.18)] text-[var(--op-accent-text)]"
                : "border-[var(--op-border)] bg-[var(--op-soft)] text-[var(--op-muted)]"
            }`}
          >
            {settings?.overlayEnabled ? (
              <>
                <CheckIcon />
                Overlay on
              </>
            ) : (
              <>
                <Cross2Icon />
                Overlay off
              </>
            )}
          </button>
        </header>

        <section className="rounded-[20px] border border-[var(--op-border)] bg-[var(--op-soft)] p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--op-muted)]">
            Last saved note
          </p>
          {lastNote ? (
            <div className="mt-3 space-y-2">
              <h2 className="line-clamp-2 text-sm font-medium leading-6 text-[var(--op-text)]">
                {lastNote.title}
              </h2>
              <p className="line-clamp-3 text-xs leading-5 text-[var(--op-muted)]">
                {lastNote.rawThought}
              </p>
              <p className="text-[11px] text-[var(--op-muted)]">
                {formatRelativeDate(lastNote.createdAt)}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm leading-6 text-[var(--op-muted)]">
              {status || "No synced notes yet. Capture one from the page overlay."}
            </p>
          )}
        </section>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            theme={settings?.darkMode ? "dark" : "light"}
            onClick={openOptions}
          >
            <GearIcon />
            Settings
          </Button>
          <Button
            variant="ghost"
            theme={settings?.darkMode ? "dark" : "light"}
            onClick={() => chrome.tabs.create({ url: "chrome://extensions" })}
          >
            <OpenInNewWindowIcon />
            Extensions
          </Button>
        </div>

        {settings?.backendApiUrl.trim() && settings.backendVerified ? (
          <div className="rounded-[20px] border border-[var(--op-border)] bg-[var(--op-soft)] p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-7 w-7 place-items-center rounded-full border border-[var(--op-border)] bg-[var(--op-soft-strong)] text-[var(--op-text)]">
                <PlusCircledIcon />
              </span>
              <div className="space-y-1">
                <p className="text-sm font-medium text-[var(--op-text)]">
                  Backend connected
                </p>
                <p className="text-xs leading-5 text-[var(--op-muted)]">
                  Notes are syncing through your configured API route.
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </GlassPanel>
    </main>
  );
}
