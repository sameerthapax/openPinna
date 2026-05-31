import { getOrCreateTodaySession } from "@/app/api/_lib/services/session.service";
import { jsonOk } from "@/app/api/_lib/http";

type Ctx = { params: Promise<{ projectId: string }> };

export async function POST(_request: Request, context: Ctx) {
  const { projectId } = await context.params;
  const result = await getOrCreateTodaySession(projectId);
  return jsonOk(result, result.created ? 201 : 200);
}
