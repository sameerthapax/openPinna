import { findLatestCaptureBySourceUrl } from "@/app/api/_lib/services/capture.service";
import { jsonError, jsonOk } from "@/app/api/_lib/http";

type Ctx = { params: Promise<{ projectId: string; sessionId: string }> };

export async function GET(request: Request, context: Ctx) {
  const { projectId, sessionId } = await context.params;
  const requestUrl = new URL(request.url);
  const urlValues = requestUrl.searchParams.getAll("url");

  if (urlValues.length === 0) {
    return jsonError("At least one url query parameter is required.");
  }

  const result = await findLatestCaptureBySourceUrl({
    projectId,
    sessionId,
    urls: urlValues,
  });

  return jsonOk({
    source: result?.source || null,
    capture: result?.capture || null,
  });
}
