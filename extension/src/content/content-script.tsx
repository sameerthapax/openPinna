import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { OVERLAY_ROOT_ID } from "../lib/constants";
import { getSettings, subscribeToSettings } from "../lib/chrome-storage";
import { OverlayApp } from "./OverlayApp";
import type { OpenPinnaSettings } from "../lib/types";

window.addEventListener("unhandledrejection", (event) => {
  const reason =
    event.reason instanceof Error ? event.reason.message : String(event.reason);

  if (reason.includes("Extension context invalidated")) {
    event.preventDefault();
  }
});

const allowedProtocols = new Set(["http:", "https:", "file:"]);
const canInject =
  allowedProtocols.has(window.location.protocol) &&
  Boolean(document.documentElement);

const existingRoot = canInject
  ? document.getElementById(OVERLAY_ROOT_ID)
  : null;

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}

function isMacPlatform() {
  return /mac/i.test(navigator.platform);
}

function matchesShortcut(event: KeyboardEvent, captureShortcut: OpenPinnaSettings["captureShortcut"]) {
  const key = event.key.toLowerCase();
  if (key !== "p" && key !== "n") {
    return false;
  }

  if (captureShortcut === "manual") {
    return false;
  }

  if (captureShortcut === "option-or-alt+p") {
    return key === "p" && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
  }

  if (captureShortcut === "mod+shift+p") {
    return key === "p" && event.shiftKey && (isMacPlatform() ? event.metaKey : event.ctrlKey);
  }

  if (captureShortcut === "mod+shift+n") {
    return key === "n" && event.shiftKey && (isMacPlatform() ? event.metaKey : event.ctrlKey);
  }

  return false;
}

if (canInject && !existingRoot) {
  const host = document.createElement("div");
  host.id = OVERLAY_ROOT_ID;
  host.style.all = "initial";

  const shadow = host.attachShadow({ mode: "open" });
  const mount = document.createElement("div");
  mount.id = "openpinna-shadow-app";

  shadow.appendChild(mount);
  document.documentElement.appendChild(host);

  createRoot(mount).render(
    <StrictMode>
      <OverlayApp />
    </StrictMode>,
  );

  let shortcut: OpenPinnaSettings["captureShortcut"] = "option-or-alt+p";
  let latestSettings: OpenPinnaSettings | null = null;
  let lastVoiceShortcutAt = 0;
  const micOnSoundUrl = chrome.runtime.getURL("soundfx/micOnSoundFX.mp3");
  const cueAudio = new Audio(micOnSoundUrl);
  cueAudio.preload = "auto";
  let cueAudioBlobUrl: string | null = null;

  async function ensureCueAudioBlobUrl() {
    if (cueAudioBlobUrl) {
      return cueAudioBlobUrl;
    }

    const response = await fetch(micOnSoundUrl);
    if (!response.ok) {
      throw new Error(`Sound fetch failed with status ${response.status}`);
    }

    const blob = await response.blob();
    cueAudioBlobUrl = URL.createObjectURL(blob);
    return cueAudioBlobUrl;
  }
  getSettings()
    .then((settings) => {
      shortcut = settings.captureShortcut;
      latestSettings = settings;
    })
    .catch(() => {
      shortcut = "option-or-alt+p";
      latestSettings = null;
    });

  const unsubscribe = subscribeToSettings((settings) => {
    shortcut = settings.captureShortcut;
    latestSettings = settings;
  });

  const onKeyDown = (event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) {
      return;
    }

    if (!matchesShortcut(event, shortcut)) {
      const isPlainMKey =
        event.key.toLowerCase() === "m" &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey;

      if (!isPlainMKey || !latestSettings?.voiceAgentEnabled || !latestSettings.openAiVerified) {
        return;
      }

      const now = Date.now();
      if (now - lastVoiceShortcutAt > 420) {
        lastVoiceShortcutAt = now;
        return;
      }

      lastVoiceShortcutAt = 0;
      event.preventDefault();

      cueAudio.volume = 0.65;
      cueAudio.currentTime = 0;
      console.log("[openPinna] Voice cue: attempting sound play", {
        src: cueAudio.src,
        readyState: cueAudio.readyState,
      });
      void cueAudio.play().then(() => {
        console.log("[openPinna] Voice cue: sound playing");
      }).catch(async (error) => {
        console.warn("[openPinna] Voice cue: sound play failed", error);

        try {
          const blobUrl = await ensureCueAudioBlobUrl();
          cueAudio.src = blobUrl;
          cueAudio.currentTime = 0;
          console.log("[openPinna] Voice cue: retrying sound play with blob URL");
          await cueAudio.play();
          console.log("[openPinna] Voice cue: sound playing via blob URL");
        } catch (retryError) {
          console.warn("[openPinna] Voice cue: blob URL retry failed", retryError);
        }
      });

      const triggerVoiceCue = () => {
        window.dispatchEvent(new CustomEvent("openpinna:voice-agent-activate"));
      };

      if (!latestSettings.overlayEnabled) {
        chrome.runtime.sendMessage({ type: "TOGGLE_OVERLAY" }, () => {
          setTimeout(triggerVoiceCue, 80);
        });
        return;
      }

      triggerVoiceCue();
      return;
    }

    event.preventDefault();
    chrome.runtime.sendMessage({ type: "TOGGLE_OVERLAY" });
  };

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("beforeunload", () => {
    unsubscribe();
    window.removeEventListener("keydown", onKeyDown, true);
  }, { once: true });
}
