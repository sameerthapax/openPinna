import { createThread, listThreadsByNote } from "@/app/api/_lib/services/chat.service";
import { createThreadSchema } from "@/app/api/_lib/validation";
import { jsonError, jsonOk, parseJson, zodError } from "@/app/api/_lib/http";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ noteId: string }> };

export async function GET(_request: Request, context: Ctx) {
  const { noteId } = await context.params;
  const threads = await listThreadsByNote(noteId);
  return jsonOk({ threads });
}

export async function POST(request: Request, context: Ctx) {
  const { noteId } = await context.params;
  const payload = await parseJson(request);
  const parsed = createThreadSchema.safeParse(payload);
  if (!parsed.success) return jsonError(zodError(parsed.error));

  const note = await db.note.findUnique({ where: { id: noteId } });
  if (!note) return jsonError("Note not found.", 404);

  const thread = await createThread({
    projectId: note.projectId,
    sessionId: note.sessionId,
    noteId,
    threadType: parsed.data.threadType,
    title: parsed.data.title,
  });

  return jsonOk({ thread }, 201);
}
