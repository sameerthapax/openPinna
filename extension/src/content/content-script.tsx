import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { OVERLAY_ROOT_ID } from "../lib/constants";
import { getSettings, subscribeToSettings, updateSettings } from "../lib/chrome-storage";
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
  let voiceToggleInFlight = false;
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

      if (!isPlainMKey) {
        return;
      }

      const now = Date.now();
      if (now - lastVoiceShortcutAt > 420) {
        lastVoiceShortcutAt = now;
        return;
      }

      lastVoiceShortcutAt = 0;
      event.preventDefault();

      if (voiceToggleInFlight) {
        return;
      }

      voiceToggleInFlight = true;
      void (async () => {
        try {
          const freshestSettings = await getSettings();
          latestSettings = freshestSettings;

          if (!freshestSettings.voiceAgentFeatureEnabled) {
            window.dispatchEvent(
              new CustomEvent("openpinna:voice-agent-status", {
                detail: { message: "Enable Voice agent feature in Settings to use double-press M." },
              }),
            );
            return;
          }

          const runtimeState = await chrome.storage.local.get("openpinna:voiceRecordingActive");
          const isVoiceRecordingActive = Boolean(runtimeState["openpinna:voiceRecordingActive"]);
          const shouldStartRecording = !isVoiceRecordingActive;

          if (shouldStartRecording && !freshestSettings.microphoneCaptureEnabled) {
            if (!navigator.mediaDevices?.getUserMedia) {
              window.dispatchEvent(
                new CustomEvent("openpinna:voice-agent-status", {
                  detail: { message: "Microphone permission is not available in this browser context." },
                }),
              );
              return;
            }

            try {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              stream.getTracks().forEach((track) => track.stop());
              const withMicPermission = await updateSettings({ microphoneCaptureEnabled: true });
              latestSettings = withMicPermission;
              await chrome.storage.local.set({ microphoneCaptureEnabled: true });
            } catch {
              await updateSettings({ microphoneCaptureEnabled: false });
              await chrome.storage.local.set({ microphoneCaptureEnabled: false });
              window.dispatchEvent(
                new CustomEvent("openpinna:voice-agent-status", {
                  detail: { message: "Microphone permission is required to use voice capture." },
                }),
              );
              return;
            }
          }

          const nextSettings = freshestSettings;
          latestSettings = nextSettings;

          const toggleMessageType = shouldStartRecording
            ? "VOICE_RECORDING_TOGGLE_ON"
            : "VOICE_RECORDING_TOGGLE_OFF";
          const toggleResponse = await chrome.runtime.sendMessage({ type: toggleMessageType });

          if (!toggleResponse?.ok) {
            await updateSettings({ voiceMicActive: false });
            latestSettings = await getSettings();

            const fallbackMessage =
              typeof toggleResponse?.message === "string"
                ? toggleResponse.message
                : "Enable microphone capture in Settings to use voice mode.";
            console.warn("[openPinna] Voice toggle rejected", fallbackMessage);
            window.dispatchEvent(
              new CustomEvent("openpinna:voice-agent-status", {
                detail: { message: fallbackMessage },
              }),
            );
            return;
          }

          await updateSettings({ voiceMicActive: shouldStartRecording });
          latestSettings = await getSettings();

          cueAudio.currentTime = 0;
          cueAudio.volume = 0.65;
          console.log("[openPinna] Voice cue: attempting sound play", {
            src: cueAudio.src,
            readyState: cueAudio.readyState,
            voiceRecordingActive: shouldStartRecording,
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
            window.dispatchEvent(
              new CustomEvent("openpinna:voice-agent-activate", {
                detail: { active: shouldStartRecording },
              }),
            );
          };

          if (!nextSettings.overlayEnabled) {
            chrome.runtime.sendMessage({ type: "TOGGLE_OVERLAY" }, () => {
              setTimeout(triggerVoiceCue, 80);
            });
          } else {
            triggerVoiceCue();
          }
        } finally {
          voiceToggleInFlight = false;
        }
      })();
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
