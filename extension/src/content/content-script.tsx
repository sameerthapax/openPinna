import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { OVERLAY_ROOT_ID } from "../lib/constants";
import { OverlayApp } from "./OverlayApp";

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
}
