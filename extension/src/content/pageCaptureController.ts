import type { OpenPinnaPageCaptureMetrics } from "../lib/types";

type ScreenshotTarget =
  | {
      id: string;
      kind: "window";
    }
  | {
      id: string;
      kind: "element";
      element: HTMLElement;
    };

let activeScreenshotTarget: ScreenshotTarget | null = null;

function toCaptureInt(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

function buildTargetId() {
  return `openpinna-target-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isVisibleElement(element: HTMLElement) {
  const rect = element.getBoundingClientRect();

  return rect.width > 40 && rect.height > 40;
}

function isScrollableElement(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  const overflowY = style.overflowY.toLowerCase();

  return (
    (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
    element.scrollHeight > element.clientHeight + 24 &&
    isVisibleElement(element)
  );
}

function scoreScrollableElement(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const widthScore = rect.width / Math.max(window.innerWidth, 1);
  const heightScore = rect.height / Math.max(window.innerHeight, 1);
  const contentScore = element.scrollHeight / Math.max(element.clientHeight, 1);

  if (widthScore < 0.32 || heightScore < 0.2) {
    return -1;
  }

  return widthScore * 4 + heightScore * 3 + contentScore;
}

function findBestScrollableElement() {
  const preferredSelectors = [
    "#viewerContainer",
    ".pdfViewer",
    "[data-testid='pdf-viewer']",
    ".react-pdf__Document",
    ".react-pdf__Page",
    "[data-page-number]",
  ];

  for (const selector of preferredSelectors) {
    const element = document.querySelector<HTMLElement>(selector);

    if (!element) {
      continue;
    }

    const scrollableCandidate = isScrollableElement(element)
      ? element
      : element.closest<HTMLElement>(":is([style*='overflow'], [class*='scroll'], [class*='viewer'])");

    if (scrollableCandidate && isScrollableElement(scrollableCandidate)) {
      return scrollableCandidate;
    }
  }

  const elements = Array.from(document.querySelectorAll<HTMLElement>("body *"));
  let bestElement: HTMLElement | null = null;
  let bestScore = -1;

  for (const element of elements) {
    if (!isScrollableElement(element)) {
      continue;
    }

    const score = scoreScrollableElement(element);

    if (score > bestScore) {
      bestScore = score;
      bestElement = element;
    }
  }

  return bestElement;
}

function resolveScreenshotTarget(): ScreenshotTarget {
  const elementTarget = findBestScrollableElement();

  if (elementTarget) {
    const target: ScreenshotTarget = {
      id: buildTargetId(),
      kind: "element",
      element: elementTarget,
    };
    activeScreenshotTarget = target;
    return target;
  }

  const target: ScreenshotTarget = {
    id: buildTargetId(),
    kind: "window",
  };
  activeScreenshotTarget = target;
  return target;
}

export function measurePageCapture(): OpenPinnaPageCaptureMetrics {
  const target = resolveScreenshotTarget();

  if (target.kind === "element") {
    return {
      targetId: target.id,
      targetKind: target.kind,
      originalScrollLeft: toCaptureInt(target.element.scrollLeft),
      originalScrollTop: toCaptureInt(target.element.scrollTop),
      scrollY: toCaptureInt(target.element.scrollTop),
      viewportWidth: toCaptureInt(target.element.clientWidth),
      viewportHeight: toCaptureInt(target.element.clientHeight),
      documentHeight: toCaptureInt(target.element.scrollHeight),
      devicePixelRatio: window.devicePixelRatio || 1,
    };
  }

  return {
    targetId: target.id,
    targetKind: target.kind,
    originalScrollLeft: toCaptureInt(window.scrollX),
    originalScrollTop: toCaptureInt(window.scrollY),
    scrollY: toCaptureInt(window.scrollY),
    viewportWidth: toCaptureInt(window.innerWidth),
    viewportHeight: toCaptureInt(window.innerHeight),
    documentHeight: toCaptureInt(
      Math.max(
      document.documentElement?.scrollHeight || 0,
      document.body?.scrollHeight || 0,
      window.innerHeight,
      ),
    ),
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}

async function waitForScrollSettle() {
  await new Promise<void>((resolve) => {
    window.setTimeout(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }, 120);
  });
}

export async function scrollPageCaptureTarget(targetId: string, scrollY: number, left = 0) {
  if (!activeScreenshotTarget || activeScreenshotTarget.id !== targetId) {
    activeScreenshotTarget = null;
    throw new Error("Screenshot target is no longer available.");
  }

  if (activeScreenshotTarget.kind === "element") {
    activeScreenshotTarget.element.scrollTo({ top: toCaptureInt(scrollY), left: toCaptureInt(left) });
    await waitForScrollSettle();
    return toCaptureInt(activeScreenshotTarget.element.scrollTop);
  }

  window.scrollTo({ top: toCaptureInt(scrollY), left: toCaptureInt(left) });
  await waitForScrollSettle();
  return toCaptureInt(window.scrollY);
}
