import { getSettings, updateSettings } from "../lib/chrome-storage";
import { resolveBackendRoute } from "../lib/backend";
import type {
  OpenPinnaBackgroundMessage,
  OpenPinnaBackendNote,
  OpenPinnaProjectSummary,
} from "../lib/types";
import { createVoiceRecordingController } from "../voice/voiceRecordingController";

const VOICE_RECORDING_ACTIVE_KEY = "openpinna:voiceRecordingActive";
const OFFSCREEN_VOICE_RECORDER_URL = "offscreen/voiceRecorderOffscreen.html";
const VOICE_BACKEND_STATUS_TTL_MS = 15_000;

let voiceRecordingActiveRuntime = false;
let voiceBackendStatusCache:
  | {
      checkedAt: number;
      projectIds: string[];
    }
  | null = null;

async function setVoiceRecordingActive(nextValue: boolean) {
  voiceRecordingActiveRuntime = nextValue;
  await chrome.storage.local.set({ [VOICE_RECORDING_ACTIVE_KEY]: nextValue });
}

async function hasOffscreenDocumentSafe(): Promise<boolean> {
  try {
    if (!chrome.offscreen?.hasDocument) {
      console.warn("[openPinna] chrome.offscreen.hasDocument is unavailable in this Chrome version.");
      return false;
    }

    return await chrome.offscreen.hasDocument();
  } catch (error) {
    console.warn("[openPinna] Could not check offscreen document state.", error);
    return false;
  }
}

async function ensureVoiceRecorderOffscreen(): Promise<void> {
  const exists = await hasOffscreenDocumentSafe();

  if (exists) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_VOICE_RECORDER_URL,
    reasons: ["USER_MEDIA"],
    justification: "Record microphone audio when the user activates OpenPinna voice mode",
  });
}

async function closeVoiceRecorderOffscreen(): Promise<void> {
  const exists = await hasOffscreenDocumentSafe();

  if (!exists) {
    return;
  }

  await chrome.offscreen.closeDocument();
}

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

async function assertSettingsVerified() {
  const settings = await getSettings();

  if (!settings.backendApiUrl.trim()) {
    throw new Error("BACKEND_URL_MISSING");
  }

  if (!settings.backendVerified) {
    throw new Error("BACKEND_NOT_VERIFIED");
  }

  return settings;
}

async function requestJson<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
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

async function requestJsonEnvelope<T>(
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
    | ({ ok?: boolean; message?: string } & T)
    | null;

  if (!response.ok || !json) {
    throw new Error(json?.message || `Backend request failed with status ${response.status}.`);
  }

  return json;
}

async function listProjectsFromBackend(): Promise<OpenPinnaProjectSummary[]> {
  const baseUrl = await readBackendBaseUrl();
  const projects = await requestJson<Array<{ id: string; title: string }>>(baseUrl, "/api/projects");
  return projects.map((project) => ({ id: project.id, title: project.title }));
}

async function syncProjectsCache(projects?: OpenPinnaProjectSummary[]) {
  const nextProjects = projects ?? (await listProjectsFromBackend());
  const settings = await getSettings();
  const fallbackProjectId =
    settings.lastSelectedProjectId && nextProjects.some((project) => project.id === settings.lastSelectedProjectId)
      ? settings.lastSelectedProjectId
      : nextProjects[0]?.id || "";

  await updateSettings({
    cachedProjects: nextProjects,
    lastSelectedProjectId: fallbackProjectId,
  });

  return nextProjects;
}

async function resolveVoiceProjectId(settings: Awaited<ReturnType<typeof getSettings>>) {
  if (settings.lastSelectedProjectId) {
    const projects = await listProjectsFromBackend().catch(() => []);
    const hasStoredProject = projects.some((project) => project.id === settings.lastSelectedProjectId);

    if (hasStoredProject) {
      return settings.lastSelectedProjectId;
    }

    const fallbackProjectId = projects[0]?.id || "";
    if (fallbackProjectId) {
      await updateSettings({ lastSelectedProjectId: fallbackProjectId });
      return fallbackProjectId;
    }
  }

  const projects = await listProjectsFromBackend();
  const fallbackProjectId = projects[0]?.id || "";

  if (fallbackProjectId) {
    await updateSettings({ lastSelectedProjectId: fallbackProjectId });
  }

  return fallbackProjectId;
}

async function listNotesFromBackend() {
  const baseUrl = await readBackendBaseUrl();
  return requestJson<OpenPinnaBackendNote[]>(baseUrl, "/api/notes");
}

async function saveNoteToBackend(note: BackendNoteRequest) {
  const baseUrl = await readBackendBaseUrl();
  const session = await requestJson<SessionResponse>(baseUrl, `/api/projects/${note.projectId}/sessions/today`, {
    method: "POST",
  });

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
    },
  );
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
    await updateSettings({ backendVerified: false, cachedProjects: [], lastSelectedProjectId: "" });
    throw new Error("Health endpoint check failed.");
  }

  const projects = await requestJson<Array<{ id: string; title: string }>>(baseUrl, "/api/projects");
  await updateSettings({ backendApiUrl: baseUrl, backendVerified: true });
  await syncProjectsCache(projects.map((project) => ({ id: project.id, title: project.title })));
}

async function verifyVoiceAgentBackendStatus() {
  if (
    voiceBackendStatusCache &&
    Date.now() - voiceBackendStatusCache.checkedAt < VOICE_BACKEND_STATUS_TTL_MS
  ) {
    const settings = await getSettings();
    const hasProjects = settings.cachedProjects.some((project) =>
      voiceBackendStatusCache?.projectIds.includes(project.id),
    );

    if (hasProjects) {
      console.info("[openPinna][voice] using cached voice backend status", {
        checkedAt: voiceBackendStatusCache.checkedAt,
        cachedProjectCount: settings.cachedProjects.length,
      });
      return {
        openAiConfigured: true,
        openAiReachable: true,
        message: "OpenAI is reachable from the backend.",
        projectCount: settings.cachedProjects.length,
        projects: settings.cachedProjects,
      };
    }
  }

  const baseUrl = await readBackendBaseUrl();
  console.info("[openPinna][voice] requesting voice backend status", { baseUrl });
  const result = await requestJsonEnvelope<{
    ok: true;
    openAiConfigured: boolean;
    openAiReachable: boolean;
    message: string;
    projectCount: number;
    projects: Array<{ id: string; title: string }>;
  }>(baseUrl, "/api/voice-agent/status");
  console.info("[openPinna][voice] voice backend status response", result);

  const rawProjects = Array.isArray(result.projects) ? result.projects : [];
  const projects = rawProjects.map((project) => ({ id: project.id, title: project.title }));
  await syncProjectsCache(projects);

  if (projects.length === 0) {
    throw new Error("Create a project first before enabling voice mode.");
  }

  if (!result.openAiConfigured || !result.openAiReachable) {
    throw new Error(result.message || "OpenAI is not reachable from the backend.");
  }

  voiceBackendStatusCache = {
    checkedAt: Date.now(),
    projectIds: projects.map((project) => project.id),
  };

  return result;
}

function respond(sendResponse: (response: unknown) => void, response: unknown) {
  sendResponse(response);
  console.info("[openPinna] message response sent", response);
}

const voiceController = createVoiceRecordingController({
  ensureOffscreen: ensureVoiceRecorderOffscreen,
  closeOffscreen: closeVoiceRecorderOffscreen,
  setVoiceRecordingActive,
});

chrome.runtime.onInstalled.addListener(() => {
  void setVoiceRecordingActive(false);
  void closeVoiceRecorderOffscreen().catch(() => {});
});

chrome.runtime.onStartup?.addListener(() => {
  void setVoiceRecordingActive(false);
  void closeVoiceRecorderOffscreen().catch(() => {});
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
    respond(sendResponse, { ok: true, handled, data: null });
    return false;
  }

  if (message.type === "NOTE_SAVED") {
    respond(sendResponse, { ok: true, handled, data: null });
    return false;
  }

  if (message.type === "TOGGLE_OVERLAY") {
    getSettings()
      .then((settings) => updateSettings({ overlayEnabled: !settings.overlayEnabled }))
      .then(() => respond(sendResponse, { ok: true, handled, data: null }))
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

  if (message.type === "VOICE_RECORDING_STARTED") {
    void voiceController.onRecordingStarted(message.mimeType).catch((error) => {
      console.error("[openPinna] Could not mark voice recording as started.", error);
    });
    respond(sendResponse, { ok: true, handled, data: { active: true } });
    return false;
  }

  if (message.type === "VOICE_RECORDING_CHUNK_READY") {
    void voiceController.onChunkReady(message.chunk).catch((error) => {
      console.error("[openPinna] Could not process voice chunk.", error);
    });
    respond(sendResponse, { ok: true, handled, data: null });
    return false;
  }

  if (message.type === "VOICE_RECORDING_STOPPED") {
    void voiceController.onRecordingStopped().catch((error) => {
      console.error("[openPinna] Could not finalize recording stop.", error);
    });
    respond(sendResponse, { ok: true, handled, data: { active: false } });
    return false;
  }

  if (message.type === "VOICE_RECORDING_ERROR") {
    console.error("[openPinna] Voice recording error", message.error);
    void voiceController.onRecordingError(message.error).catch((error) => {
      console.error("[openPinna] Could not clean up voice recording error.", error);
    });
    respond(sendResponse, {
      ok: false,
      handled,
      code: "BACKEND_REQUEST_FAILED",
      message: message.error.message,
    });
    return false;
  }

  if (message.type === "VOICE_RECORDING_START" || message.type === "VOICE_RECORDING_STOP") {
    return false;
  }

  const run = async () => {
    try {
      if (message.type === "VERIFY_BACKEND") {
        await verifyBackendHealth(message.backendApiUrl);
        return { ok: true as const, handled: message.type, data: { verified: true as const } };
      }

      if (message.type === "VERIFY_VOICE_AGENT_BACKEND") {
        await verifyVoiceAgentBackendStatus();
        return { ok: true as const, handled: message.type, data: { verified: true as const } };
      }

      if (message.type === "SAVE_CAPTURED_NOTE") {
        await assertSettingsVerified();
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

        return { ok: true as const, handled: message.type, data: note };
      }

      if (message.type === "LIST_CAPTURED_NOTES") {
        await assertSettingsVerified();
        const notes = await listNotesFromBackend();
        return { ok: true as const, handled: message.type, data: notes };
      }

      if (message.type === "LIST_PROJECTS") {
        await assertSettingsVerified();
        const projects = await syncProjectsCache();
        return { ok: true as const, handled: message.type, data: projects };
      }

      if (message.type === "DELETE_CAPTURED_NOTE") {
        await assertSettingsVerified();
        await deleteNoteFromBackend(message.id);
        return { ok: true as const, handled: message.type, data: { deleted: true } };
      }

      if (message.type === "CLEAR_CAPTURED_NOTES") {
        await assertSettingsVerified();
        const deletedCount = await clearNotesFromBackend();
        return { ok: true as const, handled: message.type, data: { deletedCount } };
      }

      if (message.type === "VOICE_RECORDING_TOGGLE_ON") {
        const settings = await getSettings();

        if (!settings.voiceAgentFeatureEnabled) {
          await updateSettings({ voiceMicActive: false });
          return {
            ok: false as const,
            handled: message.type,
            code: "BACKEND_REQUEST_FAILED" as const,
            message: "Enable Voice agent feature in Settings.",
          };
        }

        if (!settings.microphoneCaptureEnabled) {
          await updateSettings({ voiceMicActive: false });
          return {
            ok: false as const,
            handled: message.type,
            code: "BACKEND_REQUEST_FAILED" as const,
            message: "Enable microphone capture in Settings.",
          };
        }

        if (!settings.backendVerified) {
          await updateSettings({ voiceMicActive: false });
          return {
            ok: false as const,
            handled: message.type,
            code: "BACKEND_NOT_VERIFIED" as const,
            message: "Verify backend URL in settings before continuing.",
          };
        }

        await verifyVoiceAgentBackendStatus();

        const projectId = await resolveVoiceProjectId(settings);

        if (!projectId) {
          await updateSettings({ voiceMicActive: false });
          return {
            ok: false as const,
            handled: message.type,
            code: "BACKEND_REQUEST_FAILED" as const,
            message: "Create a project first before starting voice mode.",
          };
        }

        await voiceController.start(
          {
            projectId,
            pinnaId: message.payload.pinnaId,
            sourceJson: message.payload.sourceJson,
            selectedText: message.payload.selectedText,
            pageUrl: message.payload.pageUrl,
            pageTitle: message.payload.pageTitle,
            startedAt: message.payload.startedAt,
          },
          sender.tab?.id,
        );

        return { ok: true as const, handled: message.type, data: { active: true } };
      }

      if (message.type === "VOICE_RECORDING_TOGGLE_OFF") {
        if (voiceRecordingActiveRuntime || voiceController.getState().activeVoiceSessionId) {
          await voiceController.stop();
        } else {
          await setVoiceRecordingActive(false);
          await updateSettings({ voiceMicActive: false });
          await closeVoiceRecorderOffscreen();
        }

        return { ok: true as const, handled: message.type, data: { active: false } };
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

      return {
        ok: false as const,
        handled,
        code: "BACKEND_REQUEST_FAILED" as const,
        message: errorMessage,
      };
    }
  };

  void run()
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
