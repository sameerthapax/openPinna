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
  getSettings()
    .then((settings) => {
      shortcut = settings.captureShortcut;
    })
    .catch(() => {
      shortcut = "option-or-alt+p";
    });

  const unsubscribe = subscribeToSettings((settings) => {
    shortcut = settings.captureShortcut;
  });

  const onKeyDown = (event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) {
      return;
    }

    if (!matchesShortcut(event, shortcut)) {
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
