import { rebuildProjectSummary } from "@/app/api/_lib/services/knowledge.service";
import { jsonOk } from "@/app/api/_lib/http";

type Ctx = { params: Promise<{ projectId: string }> };
export async function POST(_request: Request, context: Ctx) {
  const { projectId } = await context.params;
  const summary = await rebuildProjectSummary(projectId);
  return jsonOk({ summary });
}
