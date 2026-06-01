import { rejectKnowledgeEvent } from "@/app/api/_lib/services/knowledge.service";
import { jsonOk } from "@/app/api/_lib/http";

type Ctx = { params: Promise<{ eventId: string }> };
export async function POST(_request: Request, context: Ctx) {
  const { eventId } = await context.params;
  const event = await rejectKnowledgeEvent(eventId);
  return jsonOk({ event });
}
