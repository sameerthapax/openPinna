import { useEffect, useMemo, useState } from "react";
import {
  Cross1Icon,
  ExternalLinkIcon,
  MinusIcon,
  PaperPlaneIcon,
  ResetIcon,
  SunIcon,
  MoonIcon,
} from "@radix-ui/react-icons";
import {
  getSettings,
  subscribeToSettings,
  updateSettings,
} from "../lib/chrome-storage";
import {
  BackendNotVerifiedError,
  BackendUrlMissingError,
  listProjects,
  OpenAiNotVerifiedError,
  saveCaptureDraft,
} from "../lib/backend";
import type { OpenPinnaProjectSummary, OpenPinnaSettings } from "../lib/types";
import { parseTags } from "../lib/utils";
import { getSelectedText } from "../lib/selection";
import { extractSourceMetadata } from "../lib/source-metadata";

const overlayCss = `
  :host { all: initial; }
  .op-extension {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    pointer-events: none;
    color: var(--op-text);
    font-family: "Geist Sans", "Avenir Next", ui-sans-serif, system-ui, sans-serif;
    text-rendering: geometricPrecision;
    --op-text: #f7f6f3;
    --op-muted: rgba(247, 246, 243, 0.62);
    --op-soft: rgba(247, 246, 243, 0.08);
    --op-soft-strong: rgba(255, 255, 255, 0.12);
    --op-border: rgba(255, 255, 255, 0.14);
    --op-border-strong: rgba(255, 255, 255, 0.22);
    --op-panel: rgba(18, 18, 20, 0.84);
    --op-panel-strong: rgba(8, 8, 8, 0.94);
    --op-highlight: rgba(255, 255, 255, 0.08);
    --op-accent: #edf3ec;
    --op-accent-text: #d8f0d3;
    --op-backdrop: rgba(8, 9, 12, 0.32);
  }
  .op-extension[data-theme="light"] {
    --op-text: #171613;
    --op-muted: rgba(23, 22, 19, 0.6);
    --op-soft: rgba(17, 17, 17, 0.04);
    --op-soft-strong: rgba(17, 17, 17, 0.07);
    --op-border: rgba(17, 17, 17, 0.1);
    --op-border-strong: rgba(17, 17, 17, 0.16);
    --op-panel: rgba(255, 255, 255, 0.88);
    --op-panel-strong: rgba(255, 255, 255, 0.96);
    --op-highlight: rgba(17, 17, 17, 0.05);
    --op-accent: #eef3e9;
    --op-accent-text: #506548;
    --op-backdrop: rgba(23, 22, 19, 0.14);
  }
  .op-extension * { box-sizing: border-box; }
  .op-frame {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
    padding: 24px;
    pointer-events: none;
  }
  .op-backdrop {
    position: absolute;
    inset: 0;
    border: 0;
    background: var(--op-backdrop);
    opacity: 0;
    transition:
      opacity 220ms cubic-bezier(0.16, 1, 0.3, 1);
    pointer-events: auto;
  }
  .op-backdrop[data-open="true"] { opacity: 1; }
  .op-stack {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    justify-content: flex-end;
    gap: 12px;
    max-height: calc(100dvh - 48px);
    pointer-events: auto;
  }
  .op-bubble-shell {
    position: relative;
  }
  .op-voice-ring {
    position: absolute;
    inset: -6px;
    border-radius: 999px;
    border: 1px solid rgba(245, 119, 119, 0.68);
    box-shadow: 0 0 0 0 rgba(245, 119, 119, 0.44);
    opacity: 0;
    transform: scale(0.95);
    transition: opacity 180ms cubic-bezier(0.16,1,0.3,1);
    pointer-events: none;
  }
  .op-voice-ring[data-active="true"] {
    opacity: 1;
    animation: op-voice-ring-pulse 920ms cubic-bezier(0.16,1,0.3,1);
  }
  @keyframes op-voice-ring-pulse {
    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(245, 119, 119, 0.45); }
    65% { transform: scale(1.08); box-shadow: 0 0 0 9px rgba(245, 119, 119, 0); }
    100% { transform: scale(1.02); box-shadow: 0 0 0 0 rgba(245, 119, 119, 0); }
  }
  .op-bubble {
    width: 58px;
    height: 58px;
    border-radius: 999px;
    border: 1px solid var(--op-border);
    background:
      linear-gradient(180deg, var(--op-soft-strong), var(--op-soft)),
      var(--op-panel);
    color: var(--op-text);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.16),
      inset 0 -1px 0 rgba(255,255,255,0.06),
      0 24px 70px -34px rgba(0,0,0,0.42);
    backdrop-filter: blur(24px) saturate(180%);
    display: grid;
    place-items: center;
    cursor: pointer;
    transition:
      transform 260ms cubic-bezier(0.16,1,0.3,1),
      background 260ms cubic-bezier(0.16,1,0.3,1),
      border-color 260ms cubic-bezier(0.16,1,0.3,1);
  }
  .op-bubble:hover {
    transform: translateY(-2px);
    border-color: var(--op-border-strong);
    background:
      linear-gradient(180deg, var(--op-soft-strong), var(--op-soft)),
      var(--op-panel-strong);
  }
  .op-bubble:active { transform: scale(0.98); }
  .op-mark {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: -0.04em;
  }
  .op-mark-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 999px;
    display: block;
  }
  .op-panel-shell {
    width: min(420px, calc(100vw - 24px));
    max-height: calc(100dvh - 128px);
    border-radius: 34px;
    padding: 1px;
    background:
      linear-gradient(180deg, var(--op-soft-strong), var(--op-soft)),
      rgba(255, 255, 255, 0.02);
    box-shadow: 0 30px 100px -42px rgba(0,0,0,0.9);
    overflow: hidden;
  }
  .op-panel {
    max-height: calc(100dvh - 130px);
    display: flex;
    flex-direction: column;
    border-radius: 33px;
    border: 1px solid var(--op-border);
    background:
      linear-gradient(180deg, var(--op-panel), var(--op-panel-strong));
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.12),
      inset 0 -1px 0 rgba(255,255,255,0.04);
    backdrop-filter: blur(12px) saturate(140%);
    overflow: hidden;
  }
  .op-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 1px solid var(--op-border);
    padding: 14px 15px;
  }
  .op-header-copy {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  .op-title {
    margin: 0;
    font-size: 14px;
    font-weight: 650;
    letter-spacing: -0.02em;
    color: var(--op-text);
  }
  .op-subtitle {
    margin: 0;
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--op-muted);
    font-size: 12px;
  }
  .op-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }
  .op-icon-btn {
    width: 32px;
    height: 32px;
    border: 1px solid var(--op-border);
    border-radius: 10px;
    background: var(--op-soft);
    color: var(--op-text);
    display: grid;
    place-items: center;
    cursor: pointer;
    transition:
      transform 220ms cubic-bezier(0.16,1,0.3,1),
      background 220ms cubic-bezier(0.16,1,0.3,1),
      color 220ms cubic-bezier(0.16,1,0.3,1);
  }
  .op-icon-btn:hover {
    background: var(--op-soft-strong);
  }
  .op-icon-btn:active { transform: scale(0.98); }
  .op-panel-body {
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    display: grid;
    gap: 14px;
    padding: 15px;
  }
  .op-meta {
    border: 1px solid var(--op-border);
    border-radius: 18px;
    background: var(--op-soft);
    padding: 12px;
  }
  .op-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .op-label {
    display: block;
    margin-bottom: 7px;
    color: var(--op-muted);
    font-size: 10px;
    font-weight: 650;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .op-page-title {
    margin: 0;
    color: var(--op-text);
    font-size: 13px;
    font-weight: 620;
    line-height: 1.45;
  }
  .op-url {
    margin: 6px 0 0;
    color: var(--op-muted);
    font-size: 11px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  .op-selection {
    max-height: 108px;
    overflow: auto;
    border-left: 1px solid var(--op-border-strong);
    padding-left: 10px;
    color: var(--op-text);
    font-size: 12px;
    line-height: 1.65;
  }
  .op-empty {
    color: var(--op-muted);
    font-size: 12px;
    line-height: 1.6;
  }
  .op-field {
    display: grid;
    gap: 8px;
  }
  .op-input,
  .op-textarea {
    width: 100%;
    border: 1px solid var(--op-border);
    border-radius: 16px;
    background: var(--op-soft);
    color: var(--op-text);
    outline: none;
    padding: 11px 12px;
    font: inherit;
    font-size: 13px;
    transition:
      border 220ms cubic-bezier(0.16,1,0.3,1),
      background 220ms cubic-bezier(0.16,1,0.3,1);
  }
  .op-textarea {
    min-height: 112px;
    resize: vertical;
    line-height: 1.55;
  }
  .op-input::placeholder,
  .op-textarea::placeholder { color: var(--op-muted); }
  .op-input:focus,
  .op-textarea:focus {
    border-color: var(--op-border-strong);
    background: var(--op-soft-strong);
  }
  .op-btn {
    height: 38px;
    min-width: 140px;
    border: 0;
    border-radius: 999px;
    padding: 0 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    font-weight: 650;
    white-space: nowrap;
    transition:
      transform 220ms cubic-bezier(0.16,1,0.3,1),
      background 220ms cubic-bezier(0.16,1,0.3,1),
      color 220ms cubic-bezier(0.16,1,0.3,1),
      border-color 220ms cubic-bezier(0.16,1,0.3,1);
  }
  .op-btn:active { transform: scale(0.98); }
  .op-btn-primary {
    background: linear-gradient(180deg, var(--op-text), var(--op-accent));
    color: #111111;
  }
  .op-btn-secondary {
    border: 1px solid var(--op-border);
    background: var(--op-soft);
    color: var(--op-text);
  }
  .op-btn-secondary:hover { background: var(--op-soft-strong); }
  .op-setup-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
  .op-status {
    min-height: 18px;
    color: var(--op-accent-text);
    font-size: 12px;
  }
  .op-setup {
    display: grid;
    gap: 14px;
    border: 1px solid var(--op-border);
    border-radius: 18px;
    background: var(--op-soft);
    padding: 14px;
  }
  .op-setup-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  .op-setup-title {
    margin: 0;
    font-size: 14px;
    font-weight: 650;
    letter-spacing: -0.02em;
    color: var(--op-text);
  }
  .op-setup-copy {
    margin: 5px 0 0;
    color: var(--op-muted);
    font-size: 12px;
    line-height: 1.6;
  }
  .op-steps {
    display: grid;
    gap: 10px;
    padding: 0;
    margin: 0;
    list-style: none;
  }
  .op-step {
    display: grid;
    grid-template-columns: 22px 1fr;
    gap: 10px;
    align-items: start;
    color: var(--op-muted);
    font-size: 12px;
    line-height: 1.55;
  }
  .op-step code {
    font-family: "Geist Mono", ui-monospace, SFMono-Regular, monospace;
    font-size: 11px;
    color: var(--op-text);
  }
  .op-step-badge {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 999px;
    border: 1px solid var(--op-border);
    background: var(--op-soft);
    color: var(--op-text);
    font-size: 11px;
    font-weight: 650;
  }
  .op-link {
    border: 0;
    background: transparent;
    color: var(--op-text);
    padding: 0;
    cursor: pointer;
    font: inherit;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .op-footer-note {
    color: var(--op-muted);
    font-size: 11px;
    line-height: 1.5;
  }
`;

export function OverlayApp() {
  const [settings, setSettings] = useState<OpenPinnaSettings | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [bubbleLogoUnavailable, setBubbleLogoUnavailable] = useState(false);
  const [showSetupPrompt, setShowSetupPrompt] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [selectedTextSource, setSelectedTextSource] = useState("page");
  const [rawThought, setRawThought] = useState("");
  const [tags, setTags] = useState("");
  const [projects, setProjects] = useState<OpenPinnaProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [voiceCueActive, setVoiceCueActive] = useState(false);
  const sessionDateIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    let active = true;

    getSettings()
      .then((nextSettings) => {
        if (!active) {
          return;
        }

        setSettings(nextSettings);
        setTags(nextSettings.defaultTags.join(", "));
        const initialSelection = getSelectedText();
        if (initialSelection) {
          setSelectedText(initialSelection);
        }
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes("Extension context invalidated")) {
          console.warn("[openPinna] settings could not be loaded", error);
        }

        setSettings((current) => current ?? null);
      });

    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeToSettings((nextSettings) => {
        setSettings(nextSettings);
        setTags((current) => current || nextSettings.defaultTags.join(", "));
        if (!nextSettings.overlayEnabled) {
          setExpanded(false);
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("Extension context invalidated")) {
        console.warn("[openPinna] settings subscription failed", error);
      }
    }

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!settings?.autoDetectSelection) {
      return;
    }

    const updateSelection = () => {
      const nextSelection = getSelectedText();

      if (nextSelection) {
        setSelectedText(nextSelection);
        setSelectedTextSource("page");
      }
    };

    document.addEventListener("selectionchange", updateSelection);
    return () =>
      document.removeEventListener("selectionchange", updateSelection);
  }, [settings?.autoDetectSelection]);

  useEffect(() => {
    if (!expanded || !settings?.backendVerified || !settings.openAiVerified) {
      return;
    }

    let active = true;
    setProjectsLoading(true);
    listProjects()
      .then((nextProjects) => {
        if (!active) return;
        setProjects(nextProjects);
        setSelectedProjectId((current) => current || nextProjects[0]?.id || "");
      })
      .catch((error) => {
        if (!active) return;
        setStatus(error instanceof Error ? error.message : "Could not load projects.");
      })
      .finally(() => {
        if (!active) return;
        setProjectsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [expanded, settings?.backendVerified, settings?.openAiVerified]);

  useEffect(() => {
    const onVoiceAgentActivate = () => {
      playVoiceActivationCue();
    };

    window.addEventListener("openpinna:voice-agent-activate", onVoiceAgentActivate);
    return () => {
      window.removeEventListener("openpinna:voice-agent-activate", onVoiceAgentActivate);
    };
  }, []);

  const pageUrl = useMemo(() => window.location.href, []);
  const pageTitle = useMemo(() => document.title || "Untitled page", []);
  const themeMode = settings?.darkMode ? "dark" : "light";
  const isBackendReady = Boolean(settings?.backendApiUrl.trim() && settings?.backendVerified);
  const isOpenAiReady = Boolean(settings?.openAiApiKey.trim() && settings?.openAiVerified);
  const isCaptureReady = isBackendReady && isOpenAiReady;
  const hasProjects = projects.length > 0;
  const shouldShowSetup = showSetupPrompt || !isCaptureReady || (!projectsLoading && !hasProjects);
  const createProjectUrl = settings?.backendApiUrl.trim()
    ? `${settings.backendApiUrl.trim().replace(/\/+$/, "")}/notes`
    : "";
  const logoUrl = useMemo(
    () => chrome.runtime.getURL("icons/openPinnaLogo.svg"),
    [],
  );
  function playVoiceActivationCue() {
    setExpanded(true);
    setShowSetupPrompt(false);
    setVoiceCueActive(true);
    setTimeout(() => {
      setVoiceCueActive(false);
    }, 1200);
  }

  function closePanel() {
    setExpanded(false);
    setShowSetupPrompt(false);
    setStatus("");
  }

  async function disableOverlay() {
    await updateSettings({ overlayEnabled: false });
    setExpanded(false);
    setShowSetupPrompt(false);
    setStatus("");
  }

  function clearSelectedText() {
    setSelectedText("");
    setSelectedTextSource("manual");
  }

  function openSettings() {
    chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
  }

  function openProjectSetup() {
    if (!createProjectUrl) {
      openSettings();
      return;
    }
    window.open(createProjectUrl, "_blank", "noopener,noreferrer");
  }

  async function saveNote() {
    if (!isCaptureReady) {
      setShowSetupPrompt(true);
      setStatus("Verify backend and OpenAI settings before creating notes.");
      return;
    }

    if (!selectedProjectId) {
      setShowSetupPrompt(true);
      setStatus("No project selected. Create one in the web app first.");
      return;
    }

    const draft = {
      projectId: selectedProjectId,
      sessionDate: sessionDateIso,
      pageTitle,
      pageUrl,
      selectedText,
      rawThought,
      tags: parseTags(tags),
      sourceMetadata: extractSourceMetadata(pageTitle, pageUrl),
    };

    setIsSaving(true);
    setStatus("Saving to backend…");

    try {
      const savedNote = await saveCaptureDraft(draft);
      setRawThought("");
      setShowSetupPrompt(false);
      setStatus("Saved to backend.");

      // TODO: add AI note structuring after the real model route exists.
      // TODO: add voice capture as a separate input path for raw thoughts.
      // TODO: add semantic search indexing once research memory is designed.
      chrome.runtime.sendMessage({ type: "NOTE_SAVED", note: savedNote });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not save note.";

      if (
        error instanceof BackendUrlMissingError ||
        error instanceof BackendNotVerifiedError ||
        error instanceof OpenAiNotVerifiedError
      ) {
        setShowSetupPrompt(true);
      }

      setStatus(message);
    } finally {
      setIsSaving(false);
    }
  }

  if (!settings?.overlayEnabled) {
    return (
      <>
        <style>{overlayCss}</style>
      </>
    );
  }

  return (
    <>
      <style>{overlayCss}</style>
      <div className="op-extension" data-theme={themeMode}>
        {expanded ? (
          <button
            className="op-backdrop"
            type="button"
            aria-label="Close openPinna capture panel"
            data-open="true"
            onClick={closePanel}
          />
        ) : null}

        <div className="op-frame">
          <div className="op-stack">
            {expanded ? (
              <section
                className="op-panel-shell"
                aria-label="openPinna capture panel"
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="op-panel">
                  <header className="op-panel-header">
                    <div className="op-header-copy">
                      <h2 className="op-title">openPinna capture</h2>
                      <p className="op-subtitle">{pageTitle}</p>
                    </div>
                    <div className="op-actions">
                      <button
                        className="op-icon-btn"
                        type="button"
                        title={
                          settings?.darkMode ? "Switch to light mode" : "Switch to dark mode"
                        }
                        onClick={async () => {
                          if (!settings) {
                            return;
                          }

                          await updateSettings({ darkMode: !settings.darkMode });
                        }}
                      >
                        {settings?.darkMode ? <SunIcon /> : <MoonIcon />}
                      </button>
                      <button
                        className="op-icon-btn"
                        type="button"
                        title="Turn off overlay"
                        onClick={disableOverlay}
                      >
                        <Cross1Icon />
                      </button>
                      <button
                        className="op-icon-btn"
                        type="button"
                        title="Minimize"
                        onClick={closePanel}
                      >
                        <MinusIcon />
                      </button>
                    </div>
                  </header>

                  <div className="op-panel-body">
                    <div className="op-meta">
                      <span className="op-label">Current source</span>
                      <p className="op-page-title">{pageTitle}</p>
                      <p className="op-url">{pageUrl}</p>
                    </div>

                    <div className="op-meta">
                      <div className="op-row">
                        <span className="op-label">Selected text</span>
                          <button
                            className="op-icon-btn"
                            type="button"
                            title="Clear selected text"
                            onClick={clearSelectedText}
                          >
                            <ResetIcon />
                          </button>
                        </div>
                      {selectedText ? (
                        <div className="op-selection">{selectedText}</div>
                      ) : (
                        <div className="op-empty">
                          Highlight text on the page and open this panel again,
                          or type a note without a selection.
                        </div>
                      )}
                      <p className="op-footer-note">
                        {selectedTextSource === "manual"
                          ? "Selection was cleared manually."
                          : "Last non-empty selection is preserved until you replace or clear it."}
                      </p>
                    </div>

                    {shouldShowSetup ? (
                      <div className="op-setup">
                        <div className="op-setup-head">
                          <div>
                            <h3 className="op-setup-title">
                              {!isCaptureReady
                                ? "Finish settings verification"
                                : "No projects found"}
                            </h3>
                            <p className="op-setup-copy">
                              {!isCaptureReady
                                ? "Verify backend and OpenAI settings before creating notes."
                                : "No project setup yet. Create a project in openPinna first."}
                            </p>
                          </div>
                          <button
                            className="op-icon-btn"
                            type="button"
                            title="Dismiss"
                            onClick={() => setShowSetupPrompt(false)}
                          >
                            <Cross1Icon />
                          </button>
                        </div>

                        {!isCaptureReady ? (
                          <ol className="op-steps">
                            <li className="op-step">
                              <span className="op-step-badge">1</span>
                              <span>Set backend URL in Settings and click Verify backend.</span>
                            </li>
                            <li className="op-step">
                              <span className="op-step-badge">2</span>
                              <span>Add OpenAI API key and click Verify OpenAI.</span>
                            </li>
                            <li className="op-step">
                              <span className="op-step-badge">3</span>
                              <span>Reopen this modal and select a project.</span>
                            </li>
                          </ol>
                        ) : (
                          <ol className="op-steps">
                            <li className="op-step">
                              <span className="op-step-badge">1</span>
                              <span>Open openPinna web app at <code>/notes</code>.</span>
                            </li>
                            <li className="op-step">
                              <span className="op-step-badge">2</span>
                              <span>Create a project.</span>
                            </li>
                            <li className="op-step">
                              <span className="op-step-badge">3</span>
                              <span>Come back to this modal and select the project.</span>
                            </li>
                          </ol>
                        )}

                        <div className="op-setup-actions">
                          <button
                            className="op-btn op-btn-primary"
                            type="button"
                            onClick={!isCaptureReady ? openSettings : openProjectSetup}
                          >
                            <ExternalLinkIcon />
                            {!isCaptureReady ? "Open settings" : "Create project"}
                          </button>
                          <button
                            className="op-btn op-btn-secondary"
                            type="button"
                            onClick={() => setShowSetupPrompt(false)}
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <label className="op-field">
                          <span className="op-label">Project</span>
                          <select
                            className="op-input"
                            value={selectedProjectId}
                            onChange={(event) => setSelectedProjectId(event.target.value)}
                          >
                            {projects.map((project) => (
                              <option key={project.id} value={project.id}>
                                {project.title}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="op-field">
                          <span className="op-label">Session</span>
                          <input
                            className="op-input"
                            value={`${sessionDateIso} (auto-created if missing)`}
                            disabled
                          />
                        </label>

                        <label className="op-field">
                          <span className="op-label">What did you notice?</span>
                          <textarea
                            className="op-textarea"
                            value={rawThought}
                            placeholder="Question, contradiction, method detail, or connection..."
                            onChange={(event) => setRawThought(event.target.value)}
                          />
                        </label>

                        <label className="op-field">
                          <span className="op-label">Tags</span>
                          <input
                            className="op-input"
                            value={tags}
                            placeholder="methods, literature, follow-up"
                            onChange={(event) => setTags(event.target.value)}
                          />
                        </label>
                      </>
                    )}

                    {!shouldShowSetup ? (
                      <div className="op-row">
                        <span className="op-status">{status}</span>
                        <button
                          className="op-btn op-btn-primary"
                          type="button"
                          disabled={isSaving || !rawThought.trim() || !selectedProjectId}
                          onClick={saveNote}
                        >
                          <PaperPlaneIcon />
                          {isSaving ? "Saving" : "Save"}
                        </button>
                      </div>
                    ) : (
                      <p className="op-footer-note">
                        openPinna keeps settings local and only enables capture after settings verification.
                      </p>
                    )}
                  </div>
                </div>
              </section>
            ) : null}

            <div className="op-bubble-shell">
              <span className="op-voice-ring" data-active={voiceCueActive ? "true" : "false"} />
              <button
                className="op-bubble"
                type="button"
                title={expanded ? "Close openPinna capture" : "Open openPinna capture"}
                onClick={() => {
                  if (expanded) {
                    setExpanded(false);
                  } else {
                    setExpanded(true);
                  }
                  setShowSetupPrompt(false);
                }}
              >
                {!bubbleLogoUnavailable ? (
                  <img
                    src={logoUrl}
                    alt=""
                    aria-hidden="true"
                    className="op-mark-image"
                    onError={() => setBubbleLogoUnavailable(true)}
                  />
                ) : (
                  <span className="op-mark">op</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
