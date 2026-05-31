import { db } from "@/lib/db";
import { jsonOk } from "@/app/api/_lib/http";

type Ctx = { params: Promise<{ threadId: string; version: string }> };

export async function GET(_request: Request, context: Ctx) {
  const { threadId, version } = await context.params;
  const buildVersion = Number(version);

  const build = await db.knowledgeBuild.findFirst({
    where: { threadId, buildVersion },
  });

  if (!build) return jsonOk({ build: null, nodes: [], edges: [], summaries: [] });

  const [nodes, edges, summaries] = await Promise.all([
    db.knowledgeNode.findMany({ where: { threadId, buildId: build.id }, orderBy: { createdAt: "asc" } }),
    db.knowledgeEdge.findMany({ where: { threadId, buildId: build.id }, orderBy: { createdAt: "asc" } }),
    db.knowledgeSummary.findMany({ where: { threadId, buildId: build.id }, orderBy: { summaryType: "asc" } }),
  ]);

  return jsonOk({ build, nodes, edges, summaries });
}
