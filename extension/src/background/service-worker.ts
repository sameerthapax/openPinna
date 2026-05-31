import { getSettings, updateSettings } from "../lib/chrome-storage";
import type {
  OpenPinnaBackgroundMessage,
  OpenPinnaBackendNote,
  OpenPinnaProjectSummary,
} from "../lib/types";
import { resolveBackendRoute } from "../lib/backend";

type BackendNoteRequest = {
  projectId: string;
  sessionDate: string;
  title: string;
  sourceUrl: string;
  sourceTitle: string;
  selectedText: string;
  body: string;
  tags: string[];
  sourceMetadata: Record<string, unknown>;
};

type SessionResponse = { id: string };
type SourceResponse = { id: string };

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

async function readBackendBaseUrl() {
  const { backendApiUrl } = await getSettings();
  const normalized = backendApiUrl.trim().replace(/\/+$/, "");

  if (!normalized) {
    throw new Error("BACKEND_URL_MISSING");
  }

  return normalized;
}

async function assertSettingsVerified(requireOpenAi: boolean) {
  const settings = await getSettings();

  if (!settings.backendApiUrl.trim()) {
    throw new Error("BACKEND_URL_MISSING");
  }

  if (!settings.backendVerified) {
    throw new Error("BACKEND_NOT_VERIFIED");
  }

  if (requireOpenAi && !settings.openAiVerified) {
    throw new Error("OPENAI_NOT_VERIFIED");
  }

  return settings;
}

async function requestJson<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(resolveBackendRoute(baseUrl, path), {
    method: init?.method ?? "GET",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const json = (await response.json().catch(() => null)) as
    | {
        ok?: boolean;
        message?: string;
        note?: T;
        notes?: T;
        source?: T;
        sources?: T;
        project?: T;
        projects?: T;
        session?: T;
        deletedCount?: number;
      }
    | null;

  if (!response.ok || !json) {
    throw new Error(json?.message || `Backend request failed with status ${response.status}.`);
  }

  if ("note" in json && json.note) return json.note;
  if ("notes" in json && json.notes) return json.notes;
  if ("source" in json && json.source) return json.source;
  if ("sources" in json && json.sources) return json.sources;
  if ("project" in json && json.project) return json.project;
  if ("projects" in json && json.projects) return json.projects;
  if ("session" in json && json.session) return json.session;
  if ("deletedCount" in json && typeof json.deletedCount === "number") {
    return json.deletedCount as T;
  }

  return json as T;
}

async function listProjectsFromBackend(): Promise<OpenPinnaProjectSummary[]> {
  const baseUrl = await readBackendBaseUrl();
  const projects = await requestJson<Array<{ id: string; title: string }>>(baseUrl, "/api/projects");
  return projects.map((project) => ({ id: project.id, title: project.title }));
}

async function listNotesFromBackend() {
  const baseUrl = await readBackendBaseUrl();
  return requestJson<OpenPinnaBackendNote[]>(baseUrl, "/api/notes");
}

async function saveNoteToBackend(note: BackendNoteRequest) {
  const baseUrl = await readBackendBaseUrl();
  const session = await requestJson<SessionResponse>(
    baseUrl,
    `/api/projects/${note.projectId}/sessions/today`,
    { method: "POST" },
  );

  const source = await requestJson<SourceResponse>(
    baseUrl,
    `/api/projects/${note.projectId}/sessions/${session.id}/sources/url`,
    {
      method: "POST",
      body: JSON.stringify({
        ...note.sourceMetadata,
        title: (note.sourceMetadata.title as string | null) || note.sourceTitle || null,
        url: (note.sourceMetadata.url as string | null) || note.sourceUrl || null,
        metadata: note.sourceMetadata,
      }),
    },
  );

  const noteText = (note.selectedText || "").trim() || (note.body || "").trim();
  const userCommentary = (note.body || "").trim() || null;

  return requestJson<OpenPinnaBackendNote>(
    baseUrl,
    `/api/projects/${note.projectId}/sessions/${session.id}/notes`,
    {
    method: "POST",
    body: JSON.stringify({
      sourceId: source.id,
      noteText,
      userCommentary,
    }),
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

async function verifyBackendHealth(rawUrl: string) {
  const baseUrl = rawUrl.trim().replace(/\/+$/, "");

  if (!baseUrl) {
    throw new Error("BACKEND_URL_MISSING");
  }

  const response = await fetch(resolveBackendRoute(baseUrl, "/health"));
  if (!response.ok) {
    await updateSettings({ backendVerified: false });
    throw new Error("Health endpoint check failed.");
  }

  await updateSettings({ backendApiUrl: baseUrl, backendVerified: true });
}

async function verifyOpenAiKey(rawApiKey: string) {
  const apiKey = rawApiKey.trim();

  if (!apiKey) {
    throw new Error("OpenAI API key is required.");
  }

  const response = await fetch("https://api.openai.com/v1/models", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    await updateSettings({ openAiVerified: false });
    throw new Error("OpenAI API key verification failed.");
  }

  await updateSettings({ openAiApiKey: apiKey, openAiVerified: true });
}

function respond(sendResponse: (response: unknown) => void, response: unknown) {
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

chrome.runtime.onMessage.addListener((message: OpenPinnaBackgroundMessage, sender, sendResponse) => {
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

  if (message.type === "TOGGLE_OVERLAY") {
    getSettings()
      .then((settings) => updateSettings({ overlayEnabled: !settings.overlayEnabled }))
      .then(() =>
        respond(sendResponse, {
          ok: true,
          handled,
          data: null,
        }),
      )
      .catch((error) =>
        respond(sendResponse, {
          ok: false,
          handled,
          code: "BACKEND_REQUEST_FAILED",
          message: error instanceof Error ? error.message : "Could not toggle overlay.",
        }),
      );
    return true;
  }

  const run = async () => {
    try {
      if (message.type === "VERIFY_BACKEND") {
        await verifyBackendHealth(message.backendApiUrl);
        return { ok: true as const, handled: message.type, data: { verified: true as const } };
      }

      if (message.type === "VERIFY_OPENAI") {
        await verifyOpenAiKey(message.apiKey);
        return { ok: true as const, handled: message.type, data: { verified: true as const } };
      }

      if (message.type === "SAVE_CAPTURED_NOTE") {
        await assertSettingsVerified(true);
        const note = await saveNoteToBackend({
          projectId: message.note.projectId,
          sessionDate: message.note.sessionDate,
          title: message.note.pageTitle || "Untitled page",
          sourceUrl: message.note.pageUrl,
          sourceTitle: message.note.pageTitle || "",
          selectedText: message.note.selectedText,
          body: message.note.rawThought,
          tags: message.note.tags,
          sourceMetadata: message.note.sourceMetadata,
        });

        return {
          ok: true as const,
          handled: message.type,
          data: note,
        };
      }

      if (message.type === "LIST_CAPTURED_NOTES") {
        await assertSettingsVerified(false);
        const notes = await listNotesFromBackend();
        return {
          ok: true as const,
          handled: message.type,
          data: notes,
        };
      }

      if (message.type === "LIST_PROJECTS") {
        await assertSettingsVerified(true);
        const projects = await listProjectsFromBackend();
        return {
          ok: true as const,
          handled: message.type,
          data: projects,
        };
      }

      if (message.type === "DELETE_CAPTURED_NOTE") {
        await assertSettingsVerified(false);
        await deleteNoteFromBackend(message.id);
        return {
          ok: true as const,
          handled: message.type,
          data: { deleted: true },
        };
      }

      if (message.type === "CLEAR_CAPTURED_NOTES") {
        await assertSettingsVerified(false);
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
      const errorMessage = error instanceof Error ? error.message : "Backend request failed.";

      if (errorMessage === "BACKEND_URL_MISSING") {
        return {
          ok: false as const,
          handled,
          code: "BACKEND_URL_MISSING" as const,
          message: "Add a backend API URL in extension settings before continuing.",
        };
      }

      if (errorMessage === "BACKEND_NOT_VERIFIED") {
        return {
          ok: false as const,
          handled,
          code: "BACKEND_NOT_VERIFIED" as const,
          message: "Verify backend URL in settings before continuing.",
        };
      }

      if (errorMessage === "OPENAI_NOT_VERIFIED") {
        return {
          ok: false as const,
          handled,
          code: "OPENAI_NOT_VERIFIED" as const,
          message: "Verify OpenAI API key in settings before continuing.",
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
});
