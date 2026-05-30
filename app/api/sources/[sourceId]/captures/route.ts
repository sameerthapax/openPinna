import { createCapture, listCapturesBySource } from "@/app/api/_lib/services/capture.service";
import { createCaptureSchema } from "@/app/api/_lib/validation";
import { jsonError, jsonOk, zodError } from "@/app/api/_lib/http";

type Ctx = { params: Promise<{ sourceId: string }> };

export async function GET(_request: Request, context: Ctx) {
  const { sourceId } = await context.params;
  const captures = await listCapturesBySource(sourceId);
  return jsonOk({ captures });
}

export async function POST(request: Request, context: Ctx) {
  const { sourceId } = await context.params;
  const form = await request.formData();
  const imageFile = form.get("image");
  if (!(imageFile instanceof File)) return jsonError("image is required");

  const parsed = createCaptureSchema.safeParse({
    sessionId: form.get("sessionId"),
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
    imageFile,
    selectedText: parsed.data.selectedText || null,
    surroundingText: parsed.data.surroundingText || null,
    pageNumber: parsed.data.pageNumber || null,
    coordinates: { x: parsed.data.xPosition || null, y: parsed.data.yPosition || null },
    caption: parsed.data.caption || null,
  });

  return jsonOk({ capture }, 201);
}
