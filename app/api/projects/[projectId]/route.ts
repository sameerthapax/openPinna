import { getProject } from "@/app/api/_lib/services/project.service";
import { jsonError, jsonOk } from "@/app/api/_lib/http";

type Ctx = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, context: Ctx) {
  const { projectId } = await context.params;
  const project = await getProject(projectId);
  if (!project) return jsonError("Project not found.", 404);
  return jsonOk({ project });
}
