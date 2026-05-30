import { getSource } from "@/app/api/_lib/services/source.service";
import { jsonError, jsonOk } from "@/app/api/_lib/http";

type Ctx = { params: Promise<{ sourceId: string }> };

export async function GET(_request: Request, context: Ctx) {
  const { sourceId } = await context.params;
  const source = await getSource(sourceId);
  if (!source) return jsonError("Source not found.", 404);
  return jsonOk({ source });
}
