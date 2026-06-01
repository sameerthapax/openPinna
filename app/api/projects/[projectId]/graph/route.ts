import { db } from "@/lib/db";
import { jsonOk } from "@/app/api/_lib/http";

type Ctx = { params: Promise<{ projectId: string }> };
export async function GET(_request: Request, context: Ctx) {
  const { projectId } = await context.params;
  const nodes = await db.knowledgeNode.findMany({ where: { projectId } });
  const edges = await db.knowledgeEdge.findMany({
    where: {
      OR: [{ fromNode: { projectId } }, { toNode: { projectId } }],
    },
  });
  return jsonOk({ nodes, edges });
}
