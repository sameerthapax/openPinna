import { getSettings } from "../lib/chrome-storage";
import { resolveBackendRoute } from "../lib/backend";
import type { OpenPinnaScreenshotChunkMetadata } from "../lib/types";

export type ScreenshotSessionStartInput = {
  sessionId: string;
  audioId?: string;
  projectId?: string;
  pinnaId?: string;
  pageUrl?: string;
  pageTitle?: string;
  sourceJson?: Record<string, unknown>;
  selectedText?: string;
  documentHeight?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  devicePixelRatio?: number;
};

export type ScreenshotSessionChunkUploadInput = {
  sessionId: string;
  imageBlob: Blob;
  metadata: OpenPinnaScreenshotChunkMetadata;
};

export type ScreenshotSessionPdfUploadInput = {
  sessionId: string;
  audioId?: string;
  pdfBlob: Blob;
  pageUrl: string;
  pageTitle: string;
  sourceJson?: Record<string, unknown>;
  fileName: string;
  mimeType: string;
  originalUrl: string;
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

export async function startScreenshotSessionRequest(input: ScreenshotSessionStartInput) {
  const baseUrl = await getVerifiedBackendBaseUrl();
  const response = await fetch(
    resolveBackendRoute(baseUrl, `/api/voice-agent/sessions/${input.sessionId}/screenshots/start`),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audioId: input.audioId,
        projectId: input.projectId,
        pinnaId: input.pinnaId,
        pageUrl: input.pageUrl,
        pageTitle: input.pageTitle,
        sourceJson: input.sourceJson,
        selectedText: input.selectedText,
        documentHeight: input.documentHeight,
        viewportWidth: input.viewportWidth,
        viewportHeight: input.viewportHeight,
        devicePixelRatio: input.devicePixelRatio,
      }),
    },
  );

  return parseJsonResponse<{
    ok: true;
    screenshotId: string;
  }>(response);
}

export async function uploadScreenshotChunkRequest(input: ScreenshotSessionChunkUploadInput) {
  const baseUrl = await getVerifiedBackendBaseUrl();
  const formData = new FormData();
  formData.append("imageChunk", input.imageBlob, `${input.metadata.chunkIndex}.png`);
  formData.append("screenshotId", input.metadata.screenshotId);
  formData.append("voiceSessionId", input.metadata.voiceSessionId);
  if (input.metadata.audioId) {
    formData.append("audioId", input.metadata.audioId);
  }
  formData.append("chunkId", input.metadata.chunkId);
  formData.append("chunkIndex", String(input.metadata.chunkIndex));
  formData.append("pageUrl", input.metadata.pageUrl);
  formData.append("pageTitle", input.metadata.pageTitle);
  formData.append("scrollY", String(input.metadata.scrollY));
  formData.append("viewportWidth", String(input.metadata.viewportWidth));
  formData.append("viewportHeight", String(input.metadata.viewportHeight));
  formData.append("documentHeight", String(input.metadata.documentHeight));
  formData.append("devicePixelRatio", String(input.metadata.devicePixelRatio));
  formData.append("capturedAt", input.metadata.capturedAt);
  if (input.metadata.projectId) {
    formData.append("projectId", input.metadata.projectId);
  }
  if (input.metadata.pinnaId) {
    formData.append("pinnaId", input.metadata.pinnaId);
  }
  if (input.metadata.sourceJson) {
    formData.append("sourceJson", JSON.stringify(input.metadata.sourceJson));
  }
  if (input.metadata.selectedText) {
    formData.append("selectedText", input.metadata.selectedText);
  }

  const response = await fetch(
    resolveBackendRoute(baseUrl, `/api/voice-agent/sessions/${input.sessionId}/screenshots/chunks`),
    {
      method: "POST",
      body: formData,
    },
  );

  return parseJsonResponse<{
    ok: true;
    screenshotId: string;
    chunkId: string;
    chunkIndex: number;
    filePath: string;
    status: "stored";
  }>(response);
}

export async function finalizeScreenshotSessionRequest(sessionId: string) {
  const baseUrl = await getVerifiedBackendBaseUrl();
  const response = await fetch(
    resolveBackendRoute(baseUrl, `/api/voice-agent/sessions/${sessionId}/screenshots/finalize`),
    {
      method: "POST",
    },
  );

  return parseJsonResponse<{
    ok: true;
    screenshotId: string;
    chunkCount: number;
    manifestPath: string;
    fullImagePath: string;
    captureId: string | null;
    sourceId: string | null;
  }>(response);
}

export async function uploadScreenshotPdfRequest(input: ScreenshotSessionPdfUploadInput) {
  const baseUrl = await getVerifiedBackendBaseUrl();
  const formData = new FormData();
  formData.append("file", input.pdfBlob, input.fileName);
  formData.append("pageUrl", input.pageUrl);
  formData.append("pageTitle", input.pageTitle);
  formData.append("fileName", input.fileName);
  formData.append("mimeType", input.mimeType);
  formData.append("originalUrl", input.originalUrl);
  if (input.audioId) {
    formData.append("audioId", input.audioId);
  }
  if (input.sourceJson) {
    formData.append("sourceJson", JSON.stringify(input.sourceJson));
  }

  const response = await fetch(
    resolveBackendRoute(baseUrl, `/api/voice-agent/sessions/${input.sessionId}/screenshots/pdf`),
    {
      method: "POST",
      body: formData,
    },
  );

  return parseJsonResponse<{
    ok: true;
    screenshotId: string;
    captureId: string | null;
    sourceId: string | null;
    filePath: string;
    artifactType: "pdf";
  }>(response);
}

export async function cancelScreenshotSessionRequest(sessionId: string) {
  const baseUrl = await getVerifiedBackendBaseUrl();
  const response = await fetch(
    resolveBackendRoute(baseUrl, `/api/voice-agent/sessions/${sessionId}/screenshots/cancel`),
    {
      method: "POST",
    },
  );

  return parseJsonResponse<{
    ok: true;
    screenshotId?: string;
    status: "cancelled";
  }>(response);
}
