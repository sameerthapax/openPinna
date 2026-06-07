import { createThread, listThreadsByNote } from "@/app/api/_lib/services/chat.service";
import { listNoteBaseKnowledgeVersions } from "@/app/api/_lib/services/pinna-instance.service";
import { createThreadSchema } from "@/app/api/_lib/validation";
import { jsonError, jsonOk, parseJson, zodError } from "@/app/api/_lib/http";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ noteId: string }> };

export async function GET(_request: Request, context: Ctx) {
  const { noteId } = await context.params;
  const [threads, baseKnowledge] = await Promise.all([
    listThreadsByNote(noteId),
    listNoteBaseKnowledgeVersions(noteId),
  ]);
  return jsonOk({ threads, baseKnowledge });
}

export async function POST(request: Request, context: Ctx) {
  const { noteId } = await context.params;
  const payload = await parseJson(request);
  const parsed = createThreadSchema.safeParse(payload);
  if (!parsed.success) return jsonError(zodError(parsed.error));

  const note = await db.note.findUnique({ where: { id: noteId } });
  if (!note) return jsonError("Note not found.", 404);

  try {
    const created = await createThread({
      projectId: note.projectId,
      sessionId: note.sessionId,
      noteId,
      pinnaTemplateKey: parsed.data.pinnaTemplateKey || parsed.data.threadType || "claim",
      baseSelection: parsed.data.baseSelection,
      title: parsed.data.title,
      customInstructions: parsed.data.customInstructions,
    });

    return jsonOk(created, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create thread.";
    return jsonError(message, 400);
  }
}
