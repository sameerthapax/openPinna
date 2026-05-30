import { db } from "@/lib/db";
import { jsonOk } from "@/app/api/_lib/http";

type Ctx = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, context: Ctx) {
  const { projectId } = await context.params;
  const events = await db.knowledgeEvent.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } });
  return jsonOk({ events });
}
