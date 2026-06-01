import { jsonError, jsonOk } from "@/app/api/_lib/http";
import { getPinnaTemplateByKey } from "@/app/api/_lib/services/pinna.service";
import { getAllowedToolsForAgent } from "@/app/api/_lib/services/tool-registry.service";

type Ctx = { params: Promise<{ key: string }> };

export async function GET(_request: Request, context: Ctx) {
  const { key } = await context.params;
  const template = await getPinnaTemplateByKey(key);
  if (!template) return jsonError("Pinna template not found.", 404);

  const tools = await getAllowedToolsForAgent("pinna", template.key);
  return jsonOk({ pinnaTemplate: template, tools });
}
