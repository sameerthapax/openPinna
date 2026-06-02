function safeDecodeUrl(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function readViewerParam(url: URL) {
  const direct = url.searchParams.get("src") || url.searchParams.get("file") || url.searchParams.get("url");
  if (direct) {
    return safeDecodeUrl(direct);
  }

  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  const hashParams = new URLSearchParams(hash);
  const hashValue = hashParams.get("src") || hashParams.get("file") || hashParams.get("url");
  return hashValue ? safeDecodeUrl(hashValue) : null;
}

export function extractPdfUrlFromViewerUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const embeddedUrl = readViewerParam(url);
    if (embeddedUrl) {
      return embeddedUrl;
    }
  } catch {
    return null;
  }

  return null;
}

export function isPdfUrl(rawUrl?: string | null) {
  if (!rawUrl) {
    return false;
  }

  const lowerUrl = rawUrl.toLowerCase();

  if (lowerUrl.startsWith("blob:") && lowerUrl.includes(".pdf")) {
    return true;
  }

  if (lowerUrl.includes(".pdf?") || lowerUrl.endsWith(".pdf")) {
    return true;
  }

  const viewerUrl = extractPdfUrlFromViewerUrl(rawUrl);
  if (viewerUrl) {
    return isPdfUrl(viewerUrl);
  }

  return false;
}

export function resolvePdfDocumentUrl(rawUrl?: string | null) {
  if (!rawUrl) {
    return null;
  }

  const viewerUrl = extractPdfUrlFromViewerUrl(rawUrl);
  return viewerUrl || rawUrl;
}

export function isPdfTab(tab?: chrome.tabs.Tab | null) {
  if (!tab) {
    return false;
  }

  const candidates = [tab.url, tab.pendingUrl, tab.title];
  return candidates.some((value) => isPdfUrl(value || null));
}

export async function blobStartsWithPdfSignature(blob: Blob) {
  const header = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
  return (
    header.length >= 5 &&
    header[0] === 0x25 &&
    header[1] === 0x50 &&
    header[2] === 0x44 &&
    header[3] === 0x46 &&
    header[4] === 0x2d
  );
}

function cleanFileNameSegment(value: string) {
  return value.replace(/[/\\?%*:|"<>]/g, "-").trim();
}

export function getPdfFileName(input: {
  url?: string | null;
  title?: string | null;
  contentDisposition?: string | null;
}) {
  const disposition = input.contentDisposition || "";
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const asciiMatch = disposition.match(/filename="?([^"]+)"?/i);
  const headerFileName = utf8Match?.[1] || asciiMatch?.[1];

  if (headerFileName) {
    const decoded = cleanFileNameSegment(safeDecodeUrl(headerFileName));
    return decoded.toLowerCase().endsWith(".pdf") ? decoded : `${decoded}.pdf`;
  }

  if (input.url) {
    try {
      const url = new URL(input.url);
      const lastSegment = cleanFileNameSegment(url.pathname.split("/").filter(Boolean).pop() || "");
      if (lastSegment) {
        return lastSegment.toLowerCase().endsWith(".pdf") ? lastSegment : `${lastSegment}.pdf`;
      }
    } catch {
      // Ignore malformed URLs.
    }
  }

  const title = cleanFileNameSegment(input.title || "captured-document");
  return title.toLowerCase().endsWith(".pdf") ? title : `${title}.pdf`;
}
