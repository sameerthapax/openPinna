import { getSettings } from "./chrome-storage";
import type {
  OpenPinnaBackendNote,
  OpenPinnaBackgroundErrorCode,
  OpenPinnaBackgroundMessage,
  OpenPinnaBackgroundResponse,
  OpenPinnaCaptureDraft,
  OpenPinnaProjectSummary,
} from "./types";

export class BackendUrlMissingError extends Error {
  constructor() {
    super("Add a backend API URL in extension settings before saving notes.");
    this.name = "BackendUrlMissingError";
  }
}

export class BackendRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackendRequestError";
  }
}

export class BackendNotVerifiedError extends Error {
  constructor() {
    super("Verify the backend URL in extension settings before saving notes.");
    this.name = "BackendNotVerifiedError";
  }
}

function isBackendErrorCode(value: string): value is OpenPinnaBackgroundErrorCode {
  return (
    value === "BACKEND_URL_MISSING" ||
    value === "BACKEND_NOT_VERIFIED" ||
    value === "BACKEND_REQUEST_FAILED" ||
    value === "NOT_FOUND"
  );
}

export async function getBackendApiUrl() {
  const { backendApiUrl } = await getSettings();
  const normalized = backendApiUrl.trim().replace(/\/+$/, "");

  if (!normalized) {
    throw new BackendUrlMissingError();
  }

  return normalized;
}

function buildBackendUrl(baseUrl: string, path: string) {
  const base = baseUrl.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;

  return `${base}${suffix}`;
}

function sendBackgroundMessage<T>(
  message: OpenPinnaBackgroundMessage,
): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      message,
      (response: OpenPinnaBackgroundResponse<T> | undefined) => {
        const runtimeError = chrome.runtime.lastError;

        if (runtimeError) {
          reject(
            new BackendRequestError(
              runtimeError.message ?? "Background request failed.",
            ),
          );
          return;
        }

        if (!response) {
          reject(new BackendRequestError("No response from openPinna background."));
          return;
        }

        if (!response.ok) {
          if (isBackendErrorCode(response.code) && response.code === "BACKEND_URL_MISSING") {
            reject(new BackendUrlMissingError());
            return;
          }
          if (isBackendErrorCode(response.code) && response.code === "BACKEND_NOT_VERIFIED") {
            reject(new BackendNotVerifiedError());
            return;
          }
          reject(new BackendRequestError(response.message));
          return;
        }

        resolve(response.data);
      },
    );
  });
}

export async function saveCaptureDraft(
  draft: OpenPinnaCaptureDraft,
): Promise<OpenPinnaBackendNote> {
  return sendBackgroundMessage<OpenPinnaBackendNote>({
    type: "SAVE_CAPTURED_NOTE",
    note: draft,
  });
}

export async function listCapturedNotes(): Promise<OpenPinnaBackendNote[]> {
  return sendBackgroundMessage<OpenPinnaBackendNote[]>({
    type: "LIST_CAPTURED_NOTES",
  });
}

export async function clearCapturedNotes(): Promise<number> {
  const result = await sendBackgroundMessage<{ deletedCount: number }>({
    type: "CLEAR_CAPTURED_NOTES",
  });

  return result.deletedCount;
}

export async function listProjects(): Promise<OpenPinnaProjectSummary[]> {
  return sendBackgroundMessage<OpenPinnaProjectSummary[]>({
    type: "LIST_PROJECTS",
  });
}

export async function verifyBackend(backendApiUrl: string): Promise<void> {
  await sendBackgroundMessage<{ verified: true }>({
    type: "VERIFY_BACKEND",
    backendApiUrl,
  });
}

export async function verifyVoiceAgentBackend(): Promise<void> {
  await sendBackgroundMessage<{ verified: true }>({
    type: "VERIFY_VOICE_AGENT_BACKEND",
  });
}

export async function deleteCapturedNote(id: string): Promise<void> {
  await sendBackgroundMessage<{ deleted: true }>({
    type: "DELETE_CAPTURED_NOTE",
    id,
  });
}

export function resolveBackendRoute(baseUrl: string, path: string) {
  return buildBackendUrl(baseUrl, path);
}
