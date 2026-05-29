import { getSettings, updateSettings } from "../lib/chrome-storage";
import type {
  OpenPinnaBackgroundMessage,
  OpenPinnaBackgroundResponse,
  OpenPinnaBackendNote,
} from "../lib/types";
import { resolveBackendRoute } from "../lib/backend";

const originalFetch = globalThis.fetch.bind(globalThis);

globalThis.fetch = async (input, init) => {
  const startedAt = Date.now();
  const request = input instanceof Request ? input : new Request(input, init);

  console.info("[openPinna] request sent", {
    method: request.method,
    url: request.url,
  });

  try {
    const response = await originalFetch(request);

    console.info("[openPinna] response received", {
      method: request.method,
      url: request.url,
      status: response.status,
      ok: response.ok,
      durationMs: Date.now() - startedAt,
    });

    return response;
  } catch (error) {
    console.error("[openPinna] request failed", {
      method: request.method,
      url: request.url,
      durationMs: Date.now() - startedAt,
      error,
    });

    throw error;
  }
};

type BackendNoteRequest = {
  title: string;
  sourceUrl: string;
  sourceTitle: string;
  selectedText: string;
  rawThought: string;
  tags: string[];
};

async function readBackendBaseUrl() {
  const { backendApiUrl } = await getSettings();
  const normalized = backendApiUrl.trim().replace(/\/+$/, "");

  if (!normalized) {
    throw new Error("BACKEND_URL_MISSING");
  }

  return normalized;
}

async function requestJson<T>(
  baseUrl: string,
  path: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(resolveBackendRoute(baseUrl, path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const json = (await response.json().catch(() => null)) as
    | { ok?: boolean; note?: T; notes?: T; deleted?: boolean; deletedCount?: number; message?: string }
    | null;

  if (!response.ok || !json) {
    throw new Error(json?.message || `Backend request failed with status ${response.status}.`);
  }

  return (json.note ?? json.notes ?? json.deletedCount ?? json) as T;
}

async function listNotesFromBackend() {
  const baseUrl = await readBackendBaseUrl();
  const response = await fetch(resolveBackendRoute(baseUrl, "/api/notes"));
  const json = (await response.json().catch(() => null)) as
    | { ok?: boolean; notes?: OpenPinnaBackendNote[]; message?: string }
    | null;

  if (!response.ok || !json?.notes) {
    throw new Error(json?.message || `Backend request failed with status ${response.status}.`);
  }

  return json.notes;
}

async function saveNoteToBackend(note: BackendNoteRequest) {
  const baseUrl = await readBackendBaseUrl();
  return requestJson<OpenPinnaBackendNote>(baseUrl, "/api/notes", {
    method: "POST",
    body: JSON.stringify(note),
  });
}

async function deleteNoteFromBackend(id: string) {
  const baseUrl = await readBackendBaseUrl();
  await requestJson<{ deleted: true }>(baseUrl, `/api/notes/${id}`, {
    method: "DELETE",
  });
}

async function clearNotesFromBackend() {
  const notes = await listNotesFromBackend();

  for (const note of notes) {
    await deleteNoteFromBackend(note.id);
  }

  return notes.length;
}

function respond(sendResponse: (response: any) => void, response: any) {
  sendResponse(response);
  console.info("[openPinna] message response sent", response);
}

chrome.runtime.onInstalled.addListener(() => {
  // Intentional no-op for now. Command wiring is handled via manifest entries.
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-overlay") {
    return;
  }

  const settings = await getSettings();
  await updateSettings({ overlayEnabled: !settings.overlayEnabled });
});

chrome.runtime.onMessage.addListener(
  (message: OpenPinnaBackgroundMessage, sender, sendResponse) => {
    const handled = message.type;

    console.info("[openPinna] message received", {
      message,
      sender: {
        id: sender.id,
        tabId: sender.tab?.id,
        url: sender.url,
      },
    });

    if (message.type === "OPEN_OPTIONS") {
      chrome.runtime.openOptionsPage();
      respond(sendResponse, {
        ok: true,
        handled,
        data: null,
      });
      return false;
    }

    if (message.type === "NOTE_SAVED") {
      respond(sendResponse, {
        ok: true,
        handled,
        data: null,
      });
      return false;
    }

    const run = async () => {
      try {
        if (message.type === "SAVE_CAPTURED_NOTE") {
          const note = await saveNoteToBackend({
            title: message.note.pageTitle || "Untitled page",
            sourceUrl: message.note.pageUrl,
            sourceTitle: message.note.pageTitle || "",
            selectedText: message.note.selectedText,
            rawThought: message.note.rawThought,
            tags: message.note.tags,
          });

          return {
            ok: true as const,
            handled: message.type,
            data: note,
          };
        }

        if (message.type === "LIST_CAPTURED_NOTES") {
          const notes = await listNotesFromBackend();
          return {
            ok: true as const,
            handled: message.type,
            data: notes,
          };
        }

        if (message.type === "DELETE_CAPTURED_NOTE") {
          await deleteNoteFromBackend(message.id);
          return {
            ok: true as const,
            handled: message.type,
            data: { deleted: true },
          };
        }

        if (message.type === "CLEAR_CAPTURED_NOTES") {
          const deletedCount = await clearNotesFromBackend();
          return {
            ok: true as const,
            handled: message.type,
            data: { deletedCount },
          };
        }

        return {
          ok: false as const,
          handled,
          code: "BACKEND_REQUEST_FAILED" as const,
          message: "Unsupported background message.",
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Backend request failed.";

        if (errorMessage === "BACKEND_URL_MISSING") {
          return {
            ok: false as const,
            handled,
            code: "BACKEND_URL_MISSING" as const,
            message: "Add a backend API URL in extension settings before saving notes.",
          };
        }

        return {
          ok: false as const,
          handled,
          code: "BACKEND_REQUEST_FAILED" as const,
          message: errorMessage,
        };
      }
    };

    run()
      .then((response) => respond(sendResponse, response))
      .catch((error) => {
        respond(sendResponse, {
          ok: false,
          handled,
          code: "BACKEND_REQUEST_FAILED",
          message: error instanceof Error ? error.message : "Backend request failed.",
        });
      });

    return true;
  },
);
