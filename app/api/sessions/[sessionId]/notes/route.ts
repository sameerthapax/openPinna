import { listNotesBySession } from "@/app/api/_lib/services/note.service";
import { jsonOk } from "@/app/api/_lib/http";

type Ctx = { params: Promise<{ sessionId: string }> };

export async function GET(_request: Request, context: Ctx) {
  const { sessionId } = await context.params;
  const notes = await listNotesBySession(sessionId);
  return jsonOk({ notes });
}
