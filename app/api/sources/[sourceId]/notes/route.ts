import { listNotesBySource } from "@/app/api/_lib/services/note.service";
import { jsonOk } from "@/app/api/_lib/http";

type Ctx = { params: Promise<{ sourceId: string }> };

export async function GET(_request: Request, context: Ctx) {
  const { sourceId } = await context.params;
  const notes = await listNotesBySource(sourceId);
  return jsonOk({ notes });
}
