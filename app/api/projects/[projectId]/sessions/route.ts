import { listSessions } from "@/app/api/_lib/services/session.service";
import { jsonOk } from "@/app/api/_lib/http";

type Ctx = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, context: Ctx) {
  const { projectId } = await context.params;
  const sessions = await listSessions(projectId);
  return jsonOk({ sessions });
}
