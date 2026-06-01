import { createSourceFromUpload } from "@/app/api/_lib/services/source.service";
import { jsonError, jsonOk } from "@/app/api/_lib/http";

type Ctx = { params: Promise<{ projectId: string; sessionId: string }> };

export async function POST(request: Request, context: Ctx) {
  const { projectId, sessionId } = await context.params;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("file is required");

  const metadataText = form.get("metadata");
  const metadata =
    typeof metadataText === "string" && metadataText
      ? JSON.parse(metadataText)
      : {};

  const source = await createSourceFromUpload(projectId, sessionId, file, metadata);
  return jsonOk({ source }, 201);
}
