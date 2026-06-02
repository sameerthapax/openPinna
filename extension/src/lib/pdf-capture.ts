import { blobStartsWithPdfSignature, getPdfFileName, resolvePdfDocumentUrl } from "./pdf";

export class PdfCaptureError extends Error {
  statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "PdfCaptureError";
    this.statusCode = statusCode;
  }
}

function buildPdfCaptureMessage(statusCode?: number) {
  const suffix = typeof statusCode === "number" ? ` (status ${statusCode})` : "";
  return `This PDF could not be captured directly. Please download and upload it manually.${suffix}`;
}

export async function fetchPdfArtifact(input: {
  tabUrl?: string | null;
  originalUrl?: string | null;
  pageTitle?: string | null;
}) {
  const originalUrl = input.originalUrl || input.tabUrl || "";
  const fetchUrl = resolvePdfDocumentUrl(input.tabUrl || input.originalUrl || null);

  if (!fetchUrl) {
    throw new PdfCaptureError(buildPdfCaptureMessage());
  }

  console.info("[openPinna][pdf] starting PDF fetch", {
    tabUrl: input.tabUrl || null,
    fetchUrl,
  });

  let response: Response;
  try {
    response = await fetch(fetchUrl, {
      credentials: "include",
      redirect: "follow",
      headers: {
        Accept: "application/pdf,*/*;q=0.8",
      },
    });
  } catch (error) {
    throw new PdfCaptureError(buildPdfCaptureMessage(), undefined);
  }

  console.info("[openPinna][pdf] PDF fetch status", {
    fetchUrl,
    status: response.status,
    ok: response.ok,
  });

  if (!response.ok) {
    throw new PdfCaptureError(buildPdfCaptureMessage(response.status), response.status);
  }

  const blob = await response.blob();
  const contentType = response.headers.get("content-type");
  const validPdf =
    (contentType && contentType.toLowerCase().includes("application/pdf")) ||
    (await blobStartsWithPdfSignature(blob));

  console.info("[openPinna][pdf] PDF validation", {
    fetchUrl,
    contentType,
    blobSize: blob.size,
    validPdf,
  });

  if (!validPdf) {
    throw new PdfCaptureError(buildPdfCaptureMessage(response.status), response.status);
  }

  const fileName = getPdfFileName({
    url: response.url || fetchUrl,
    title: input.pageTitle,
    contentDisposition: response.headers.get("content-disposition"),
  });

  return {
    blob,
    mimeType: "application/pdf",
    fileName,
    originalUrl: originalUrl || response.url || fetchUrl,
  };
}
