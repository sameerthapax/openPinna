import { createProject, listProjects } from "@/app/api/_lib/services/project.service";
import { createProjectSchema } from "@/app/api/_lib/validation";
import { jsonError, jsonOk, parseJson, zodError } from "@/app/api/_lib/http";

export async function GET() {
  const projects = await listProjects();
  return jsonOk({ projects });
}

export async function POST(request: Request) {
  const payload = await parseJson(request);
  const parsed = createProjectSchema.safeParse(payload);
  if (!parsed.success) return jsonError(zodError(parsed.error));

  const project = await createProject(parsed.data);
  return jsonOk({ project }, 201);
}
