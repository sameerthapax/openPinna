import { getSettings } from "../lib/chrome-storage";
import { resolveBackendRoute } from "../lib/backend";

export type VoiceSessionCreateInput = {
  projectId: string;
  pinnaId?: string;
  sourceJson: Record<string, unknown>;
  selectedText: string;
  pageUrl: string;
  pageTitle: string;
  startedAt: string;
};

export type VoiceChunkUploadInput = {
  sessionId: string;
  audioId: string;
  chunkId: string;
  chunkIndex: number;
  mimeType: string;
  blob: Blob;
  sourceJson: Record<string, unknown>;
  selectedText: string;
  projectId: string;
  pinnaId?: string;
  pageUrl: string;
  pageTitle: string;
  startedAt: string;
};

export type VoiceChunkUploadResult = {
  ok: true;
  chunkId: string;
  chunkIndex: number;
  chunkPath: string;
  transcript?: string;
  status: "stored" | "transcribed" | "transcription_failed";
};

export type VoiceSessionFinalizeResult = {
  ok: true;
  sessionId: string;
  audioId: string;
  fullAudioPath: string;
  finalTranscript: string;
  noteId?: string;
};

export type VoiceSessionUpdateInput = {
  sessionId: string;
  sourceJson: Record<string, unknown>;
};

async function getVerifiedBackendBaseUrl() {
  const settings = await getSettings();
  const baseUrl = settings.backendApiUrl.trim().replace(/\/+$/, "");

  if (!baseUrl) {
    throw new Error("BACKEND_URL_MISSING");
  }

  if (!settings.backendVerified) {
    throw new Error("BACKEND_NOT_VERIFIED");
  }

  return baseUrl;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => null)) as (T & { message?: string }) | null;

  if (!response.ok || !json) {
    throw new Error(json?.message || `Request failed with status ${response.status}.`);
  }

  return json;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createVoiceSessionRequest(input: VoiceSessionCreateInput) {
  const baseUrl = await getVerifiedBackendBaseUrl();
  console.info("[openPinna][voice] create session request", {
    projectId: input.projectId,
    pageUrl: input.pageUrl,
    pageTitle: input.pageTitle,
    startedAt: input.startedAt,
  });
  const response = await fetch(resolveBackendRoute(baseUrl, "/api/voice-agent/sessions"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const result = await parseJsonResponse<{ ok: true; sessionId: string; audioId: string }>(response);
  console.info("[openPinna][voice] create session response", result);
  return result;
}

export async function uploadVoiceChunkRequest(input: VoiceChunkUploadInput) {
  const baseUrl = await getVerifiedBackendBaseUrl();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      console.info("[openPinna][voice] upload chunk request", {
        sessionId: input.sessionId,
        audioId: input.audioId,
        chunkId: input.chunkId,
        chunkIndex: input.chunkIndex,
        size: input.blob.size,
        attempt: attempt + 1,
      });
      const formData = new FormData();
      formData.append("audioChunk", input.blob, `${input.chunkIndex}.webm`);
      formData.append("audioId", input.audioId);
      formData.append("chunkId", input.chunkId);
      formData.append("chunkIndex", String(input.chunkIndex));
      formData.append("mimeType", input.mimeType);
      formData.append("sourceJson", JSON.stringify(input.sourceJson));
      formData.append("selectedText", input.selectedText);
      formData.append("projectId", input.projectId);
      if (input.pinnaId) {
        formData.append("pinnaId", input.pinnaId);
      }
      formData.append("pageUrl", input.pageUrl);
      formData.append("pageTitle", input.pageTitle);
      formData.append("startedAt", input.startedAt);

      const response = await fetch(
        resolveBackendRoute(baseUrl, `/api/voice-agent/sessions/${input.sessionId}/chunks`),
        {
          method: "POST",
          body: formData,
        },
      );

      const result = await parseJsonResponse<VoiceChunkUploadResult>(response);
      console.info("[openPinna][voice] upload chunk response", {
        sessionId: input.sessionId,
        chunkId: result.chunkId,
        chunkIndex: result.chunkIndex,
        status: result.status,
      });
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Chunk upload failed.");
      console.error("[openPinna][voice] upload chunk failed", {
        sessionId: input.sessionId,
        chunkId: input.chunkId,
        chunkIndex: input.chunkIndex,
        attempt: attempt + 1,
        message: lastError.message,
      });
      if (attempt < 2) {
        await wait(350 * (attempt + 1));
      }
    }
  }

  throw lastError || new Error("Chunk upload failed.");
}

export async function finalizeVoiceSessionRequest(sessionId: string) {
  const baseUrl = await getVerifiedBackendBaseUrl();
  console.info("[openPinna][voice] finalize request", { sessionId });
  const response = await fetch(resolveBackendRoute(baseUrl, `/api/voice-agent/sessions/${sessionId}/finalize`), {
    method: "POST",
  });

  const result = await parseJsonResponse<VoiceSessionFinalizeResult>(response);
  console.info("[openPinna][voice] finalize response", {
    sessionId: result.sessionId,
    audioId: result.audioId,
    noteId: result.noteId || null,
    fullAudioPath: result.fullAudioPath,
  });
  return result;
}

export async function updateVoiceSessionRequest(input: VoiceSessionUpdateInput) {
  const baseUrl = await getVerifiedBackendBaseUrl();
  console.info("[openPinna][voice] update session request", {
    sessionId: input.sessionId,
  });
  const response = await fetch(resolveBackendRoute(baseUrl, `/api/voice-agent/sessions/${input.sessionId}`), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sourceJson: input.sourceJson,
    }),
  });

  return parseJsonResponse<{
    ok: true;
    session: {
      id: string;
      noteId?: string | null;
      status: string;
    };
  }>(response);
}
