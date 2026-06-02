import type {
  OpenPinnaBackgroundMessage,
  OpenPinnaPageCaptureMetrics,
  OpenPinnaScreenshotChunkMetadata,
} from "../lib/types";
import { fetchPdfArtifact, PdfCaptureError } from "../lib/pdf-capture";
import { isPdfTab } from "../lib/pdf";
import {
  cancelScreenshotSessionRequest,
  finalizeScreenshotSessionRequest,
  type ScreenshotSessionChunkUploadInput,
  startScreenshotSessionRequest,
  uploadScreenshotPdfRequest,
  uploadScreenshotChunkRequest,
} from "./screenshotSessionClient";

const DEFAULT_CAPTURE_DELAY_MS = 500;
const DEFAULT_MAX_SCREENSHOT_CHUNKS = 75;
const DEFAULT_CAPTURE_RETRY_DELAY_MS = 1200;
const DEFAULT_MAX_CAPTURE_ATTEMPTS = 4;

type ScreenshotCaptureStartInput = {
  voiceSessionId: string;
  audioId?: string;
  projectId?: string;
  pinnaId?: string;
  tabId: number;
  windowId?: number;
  pageUrl: string;
  pageTitle: string;
  sourceJson?: Record<string, unknown>;
  selectedText?: string;
};

type ScreenshotRuntimeState = {
  voiceSessionId: string;
  screenshotId?: string;
  tabId: number;
  windowId?: number;
  cancelled: boolean;
  originalTargetId?: string;
  originalScrollTop?: number;
  originalScrollLeft?: number;
  uploadedChunkCount: number;
  completionPromise: Promise<void>;
  resolveCompletion: () => void;
};

type ScreenshotCaptureControllerDeps = {
  captureDelayMs?: number;
  maxScreenshotChunks?: number;
  captureRetryDelayMs?: number;
  maxCaptureAttempts?: number;
  sendTabMessage: (tabId: number, message: OpenPinnaBackgroundMessage) => Promise<void>;
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function shouldForceScreenshotOnly(sourceJson?: Record<string, unknown>) {
  return (
      sourceJson?.forceScreenshotOnly === true ||
      sourceJson?.captureMode === "pdf-visible-page-screenshot" ||
      sourceJson?.sourceKind === "pdf-page-screenshot"
  );
}

export function createScreenshotCaptureController(deps: ScreenshotCaptureControllerDeps) {
  const captureDelayMs = deps.captureDelayMs ?? DEFAULT_CAPTURE_DELAY_MS;
  const maxScreenshotChunks = deps.maxScreenshotChunks ?? DEFAULT_MAX_SCREENSHOT_CHUNKS;
  const captureRetryDelayMs = deps.captureRetryDelayMs ?? DEFAULT_CAPTURE_RETRY_DELAY_MS;
  const maxCaptureAttempts = deps.maxCaptureAttempts ?? DEFAULT_MAX_CAPTURE_ATTEMPTS;
  const runtimeBySessionId = new Map<string, ScreenshotRuntimeState>();

  async function measurePage(tabId: number) {
    const response = (await chrome.tabs.sendMessage(tabId, {
      type: "SCREENSHOT_CAPTURE_MEASURE_PAGE",
    } satisfies OpenPinnaBackgroundMessage)) as
      | { ok?: boolean; message?: string; metrics?: OpenPinnaPageCaptureMetrics }
      | undefined;

    if (!response?.ok || !response.metrics) {
      throw new Error(response?.message || "Could not measure page for screenshot capture.");
    }

    return response.metrics;
  }

  async function scrollTo(tabId: number, targetId: string, scrollY: number) {
    const response = (await chrome.tabs.sendMessage(tabId, {
      type: "SCREENSHOT_CAPTURE_SCROLL_TO",
      targetId,
      scrollY,
    } satisfies OpenPinnaBackgroundMessage)) as
      | { ok?: boolean; message?: string; scrollY?: number }
      | undefined;

    if (!response?.ok) {
      throw new Error(response?.message || "Could not scroll page for screenshot capture.");
    }

    return typeof response.scrollY === "number" ? response.scrollY : scrollY;
  }

  async function restoreScroll(tabId: number, targetId: string, scrollY: number, left: number) {
    await chrome.tabs
      .sendMessage(tabId, {
        type: "SCREENSHOT_CAPTURE_RESTORE_SCROLL",
        targetId,
        scrollY,
        left,
      } satisfies OpenPinnaBackgroundMessage)
      .catch(() => {});
  }

  async function captureVisibleTab(windowId?: number) {
    if (typeof windowId === "number") {
      return chrome.tabs.captureVisibleTab(windowId, { format: "png" });
    }

    return chrome.tabs.captureVisibleTab({ format: "png" });
  }

  function isCaptureQuotaError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error || "");
    return message.includes("MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND");
  }

  async function captureVisibleTabWithRetry(windowId: number | undefined, chunkIndex: number) {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxCaptureAttempts; attempt += 1) {
      try {
        return await captureVisibleTab(windowId);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Screenshot capture failed.");
        console.warn("[openPinna][screenshot] capture attempt failed", {
          chunkIndex,
          attempt,
          message: lastError.message,
        });

        if (attempt === maxCaptureAttempts) {
          break;
        }

        const retryDelay = isCaptureQuotaError(error)
          ? captureRetryDelayMs * attempt
          : Math.max(350, Math.floor(captureRetryDelayMs / 2)) * attempt;
        await wait(retryDelay);
      }
    }

    throw lastError || new Error("Screenshot capture failed.");
  }

  async function uploadChunkWithRetry(input: ScreenshotSessionChunkUploadInput) {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        return await uploadScreenshotChunkRequest(input);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Screenshot chunk upload failed.");
        console.warn("[openPinna][screenshot] upload attempt failed", {
          chunkIndex: input.metadata.chunkIndex,
          attempt,
          message: lastError.message,
        });

        if (attempt < 2) {
          await wait(500 * attempt);
        }
      }
    }

    throw lastError || new Error("Screenshot chunk upload failed.");
  }

  async function finalizeOrCancel(runtime: ScreenshotRuntimeState) {
    if (!runtime.screenshotId) {
      return;
    }

    if (runtime.cancelled && runtime.uploadedChunkCount === 0) {
      await deps.sendTabMessage(runtime.tabId, {
        type: "SCREENSHOT_SESSION_CANCEL_REQUESTED",
        voiceSessionId: runtime.voiceSessionId,
        screenshotId: runtime.screenshotId,
      });
      await cancelScreenshotSessionRequest(runtime.voiceSessionId);
      await deps.sendTabMessage(runtime.tabId, {
        type: "SCREENSHOT_SESSION_CANCELLED",
        voiceSessionId: runtime.voiceSessionId,
        screenshotId: runtime.screenshotId,
      });
      return;
    }

    await deps.sendTabMessage(runtime.tabId, {
      type: "SCREENSHOT_SESSION_FINALIZE_REQUESTED",
      voiceSessionId: runtime.voiceSessionId,
      screenshotId: runtime.screenshotId,
    });

    const result = await finalizeScreenshotSessionRequest(runtime.voiceSessionId);
    await deps.sendTabMessage(runtime.tabId, {
      type: "SCREENSHOT_SESSION_FINALIZED",
      voiceSessionId: runtime.voiceSessionId,
      screenshotId: result.screenshotId,
      chunkCount: result.chunkCount,
      manifestPath: result.manifestPath,
    });
  }

  async function start(params: ScreenshotCaptureStartInput) {
    if (runtimeBySessionId.has(params.voiceSessionId)) {
      return;
    }

    let resolveCompletion = () => {};
    const runtime: ScreenshotRuntimeState = {
      voiceSessionId: params.voiceSessionId,
      tabId: params.tabId,
      windowId: params.windowId,
      cancelled: false,
      uploadedChunkCount: 0,
      completionPromise: new Promise<void>((resolve) => {
        resolveCompletion = resolve;
      }),
      resolveCompletion,
    };
    runtimeBySessionId.set(params.voiceSessionId, runtime);

    try {
      const activeTab = await chrome.tabs.get(params.tabId).catch(() => null);
      const sourceMetadata =
        params.sourceJson?.metadata && typeof params.sourceJson.metadata === "object"
          ? (params.sourceJson.metadata as Record<string, unknown>)
          : null;
      const sourceContentType =
        typeof sourceMetadata?.contentType === "string" ? sourceMetadata.contentType : null;
      const forceScreenshotOnly = shouldForceScreenshotOnly(params.sourceJson);

      const shouldCapturePdf =
          !forceScreenshotOnly &&
          (
              isPdfTab(activeTab) ||
              (typeof params.sourceJson?.pdfUrl === "string" && Boolean(params.sourceJson.pdfUrl)) ||
              (typeof sourceContentType === "string" && sourceContentType.toLowerCase().includes("application/pdf"))
          );

      if (isPdfTab(activeTab) && forceScreenshotOnly) {
        console.info("[openPinna][pdf] forceScreenshotOnly enabled; skipping PDF fetch", {
          voiceSessionId: params.voiceSessionId,
          tabId: params.tabId,
          tabUrl: activeTab?.url || params.pageUrl,
        });
      }

      if (shouldCapturePdf) {
        console.info("[openPinna][pdf] detected PDF tab", {
          voiceSessionId: params.voiceSessionId,
          tabId: params.tabId,
          tabUrl: activeTab?.url || params.pageUrl,
        });

        await deps.sendTabMessage(params.tabId, {
          type: "SCREENSHOT_SESSION_START_REQUESTED",
          voiceSessionId: params.voiceSessionId,
        });

        const pdfArtifact = await fetchPdfArtifact({
          tabUrl: activeTab?.url || params.pageUrl,
          originalUrl:
            (typeof params.sourceJson?.pdfUrl === "string" && params.sourceJson.pdfUrl) || params.pageUrl,
          pageTitle: params.pageTitle,
        });

        const result = await uploadScreenshotPdfRequest({
          sessionId: params.voiceSessionId,
          audioId: params.audioId,
          pdfBlob: pdfArtifact.blob,
          pageUrl: params.pageUrl,
          pageTitle: params.pageTitle,
          sourceJson: params.sourceJson,
          fileName: pdfArtifact.fileName,
          mimeType: pdfArtifact.mimeType,
          originalUrl: pdfArtifact.originalUrl,
        });
        console.info("[openPinna][pdf] PDF upload success", {
          voiceSessionId: params.voiceSessionId,
          screenshotId: result.screenshotId,
          captureId: result.captureId,
          filePath: result.filePath,
        });

        runtime.screenshotId = result.screenshotId;

        await deps.sendTabMessage(params.tabId, {
          type: "SCREENSHOT_SESSION_STARTED",
          voiceSessionId: params.voiceSessionId,
          screenshotId: result.screenshotId,
        });
        await deps.sendTabMessage(params.tabId, {
          type: "SCREENSHOT_SESSION_FINALIZED",
          voiceSessionId: params.voiceSessionId,
          screenshotId: result.screenshotId,
          chunkCount: 1,
          manifestPath: result.filePath,
        });
        return;
      }

      await deps.sendTabMessage(params.tabId, {
        type: "SCREENSHOT_SESSION_START_REQUESTED",
        voiceSessionId: params.voiceSessionId,
      });

      const metrics = await measurePage(params.tabId);
      runtime.originalTargetId = metrics.targetId;
      runtime.originalScrollTop = metrics.originalScrollTop;
      runtime.originalScrollLeft = metrics.originalScrollLeft;

      await deps.sendTabMessage(params.tabId, {
        type: "SCREENSHOT_CAPTURE_PAGE_MEASURED",
        metrics,
      });

      const session = await startScreenshotSessionRequest({
        sessionId: params.voiceSessionId,
        audioId: params.audioId,
        projectId: params.projectId,
        pinnaId: params.pinnaId,
        pageUrl: params.pageUrl,
        pageTitle: params.pageTitle,
        sourceJson: params.sourceJson,
        selectedText: params.selectedText,
        documentHeight: metrics.documentHeight,
        viewportWidth: metrics.viewportWidth,
        viewportHeight: metrics.viewportHeight,
        devicePixelRatio: metrics.devicePixelRatio,
      });

      runtime.screenshotId = session.screenshotId;

      await deps.sendTabMessage(params.tabId, {
        type: "SCREENSHOT_SESSION_STARTED",
        voiceSessionId: params.voiceSessionId,
        screenshotId: session.screenshotId,
      });

      let chunkIndex = 0;
      let nextScrollY = 0;
      let lastSuccessfulScrollY = -1;
      let consecutiveFailures = 0;

      while (!runtime.cancelled && chunkIndex < maxScreenshotChunks) {
        const actualScrollY = await scrollTo(params.tabId, metrics.targetId, nextScrollY);

        if (chunkIndex > 0 && actualScrollY <= lastSuccessfulScrollY) {
          break;
        }

        await deps.sendTabMessage(params.tabId, {
          type: "SCREENSHOT_CAPTURE_SCROLLED",
          targetId: metrics.targetId,
          scrollY: actualScrollY,
        });

        await wait(captureDelayMs);

        const metadata: OpenPinnaScreenshotChunkMetadata = {
          screenshotId: session.screenshotId,
          voiceSessionId: params.voiceSessionId,
          audioId: params.audioId,
          chunkId: crypto.randomUUID(),
          chunkIndex,
          pageUrl: params.pageUrl,
          pageTitle: params.pageTitle,
          scrollY: actualScrollY,
          viewportWidth: metrics.viewportWidth,
          viewportHeight: metrics.viewportHeight,
          documentHeight: metrics.documentHeight,
          devicePixelRatio: metrics.devicePixelRatio,
          capturedAt: new Date().toISOString(),
          projectId: params.projectId,
          pinnaId: params.pinnaId,
          sourceJson: params.sourceJson,
          selectedText: params.selectedText,
        };

        try {
          const dataUrl = await captureVisibleTabWithRetry(params.windowId, chunkIndex);
          const blob = await fetch(dataUrl).then((response) => response.blob());

          await deps.sendTabMessage(params.tabId, {
            type: "SCREENSHOT_CHUNK_CAPTURED",
            metadata,
          });
          await deps.sendTabMessage(params.tabId, {
            type: "SCREENSHOT_CHUNK_UPLOAD_REQUESTED",
            metadata,
          });
          const result = await uploadChunkWithRetry({
            sessionId: params.voiceSessionId,
            imageBlob: blob,
            metadata,
          });
          runtime.uploadedChunkCount += 1;
          consecutiveFailures = 0;
          await deps.sendTabMessage(params.tabId, {
            type: "SCREENSHOT_CHUNK_UPLOADED",
            metadata,
            filePath: result.filePath,
            status: "stored",
          });

          chunkIndex += 1;
          lastSuccessfulScrollY = actualScrollY;

          if (actualScrollY + metrics.viewportHeight >= metrics.documentHeight) {
            break;
          }

          nextScrollY = Math.min(
            actualScrollY + Math.max(1, Math.floor(metrics.viewportHeight * 0.9)),
            Math.max(metrics.documentHeight - metrics.viewportHeight, 0),
          );
        } catch (error) {
          consecutiveFailures += 1;
          const message = error instanceof Error ? error.message : "Screenshot chunk upload failed.";
          await deps.sendTabMessage(params.tabId, {
            type: "SCREENSHOT_CHUNK_UPLOAD_FAILED",
            metadata: {
              voiceSessionId: params.voiceSessionId,
              chunkId: metadata.chunkId,
              chunkIndex: metadata.chunkIndex,
            },
            message,
          });

          if (consecutiveFailures >= 3) {
            throw new Error(`Screenshot capture aborted after repeated failures: ${message}`);
          }

          await wait(captureRetryDelayMs);
        }
      }

      await finalizeOrCancel(runtime);
    } catch (error) {
      const message =
        error instanceof PdfCaptureError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Screenshot session failed.";
      console.error("[openPinna][screenshot] screenshot session failed", {
        voiceSessionId: params.voiceSessionId,
        message,
        statusCode: error instanceof PdfCaptureError ? error.statusCode : undefined,
      });

      await deps.sendTabMessage(params.tabId, {
        type: "SCREENSHOT_SESSION_ERROR",
        voiceSessionId: params.voiceSessionId,
        screenshotId: runtime.screenshotId,
        message,
      });

      if (runtime.screenshotId) {
        await cancelScreenshotSessionRequest(params.voiceSessionId).catch(() => {});
      }
    } finally {
      if (
        runtime.originalTargetId &&
        typeof runtime.originalScrollTop === "number" &&
        typeof runtime.originalScrollLeft === "number"
      ) {
        await restoreScroll(
          params.tabId,
          runtime.originalTargetId,
          runtime.originalScrollTop,
          runtime.originalScrollLeft,
        );
      }

      runtimeBySessionId.delete(params.voiceSessionId);
      runtime.resolveCompletion();
    }
  }

  async function stop(voiceSessionId: string) {
    const runtime = runtimeBySessionId.get(voiceSessionId);

    if (!runtime) {
      return;
    }

    runtime.cancelled = true;
    await deps.sendTabMessage(runtime.tabId, {
      type: "SCREENSHOT_SESSION_CANCEL_REQUESTED",
      voiceSessionId,
      screenshotId: runtime.screenshotId,
    });
    await runtime.completionPromise;
  }

  return {
    start,
    stop,
  };
}
