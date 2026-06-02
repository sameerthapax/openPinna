import { createCapture, listCapturesBySource } from "@/app/api/_lib/services/capture.service";
import { createCaptureSchema } from "@/app/api/_lib/validation";
import { jsonError, jsonOk, zodError } from "@/app/api/_lib/http";

type Ctx = { params: Promise<{ sourceId: string }> };
const allowedCaptureMimeTypes = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);

export async function GET(_request: Request, context: Ctx) {
  const { sourceId } = await context.params;
  const captures = await listCapturesBySource(sourceId);
  return jsonOk({ captures });
}

export async function POST(request: Request, context: Ctx) {
  const { sourceId } = await context.params;
  const form = await request.formData();
  const artifactFile = form.get("file") || form.get("image");
  if (!(artifactFile instanceof File)) return jsonError("file is required");

  const artifactMimeType = artifactFile.type || "application/octet-stream";
  if (!allowedCaptureMimeTypes.has(artifactMimeType)) {
    return jsonError("file mimeType is invalid");
  }

  const parsed = createCaptureSchema.safeParse({
    sessionId: form.get("sessionId"),
    artifactType: form.get("artifactType"),
    captureMode: form.get("captureMode"),
    mimeType: form.get("mimeType"),
    originalUrl: form.get("originalUrl"),
    title: form.get("title"),
    fileName: form.get("fileName"),
    source: form.get("source"),
    selectedText: form.get("selectedText"),
    surroundingText: form.get("surroundingText"),
    pageNumber: form.get("pageNumber"),
    xPosition: form.get("xPosition"),
    yPosition: form.get("yPosition"),
    caption: form.get("caption"),
  });
  if (!parsed.success) return jsonError(zodError(parsed.error));

  const capture = await createCapture({
    sourceId,
    sessionId: parsed.data.sessionId,
    artifactFile,
    artifactType: parsed.data.artifactType || undefined,
    captureMode: parsed.data.captureMode || undefined,
    mimeType: parsed.data.mimeType || artifactMimeType,
    originalUrl: parsed.data.originalUrl || null,
    title: parsed.data.title || null,
    fileName: parsed.data.fileName || artifactFile.name || null,
    source: parsed.data.source || "browser-extension",
    selectedText: parsed.data.selectedText || null,
    surroundingText: parsed.data.surroundingText || null,
    pageNumber: parsed.data.pageNumber || null,
    coordinates: { x: parsed.data.xPosition || null, y: parsed.data.yPosition || null },
    caption: parsed.data.caption || null,
  });

  return jsonOk({ capture }, 201);
}
