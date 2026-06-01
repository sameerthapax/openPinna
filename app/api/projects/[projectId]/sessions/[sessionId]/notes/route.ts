import { createNote } from "@/app/api/_lib/services/note.service";
import { createNoteSchema } from "@/app/api/_lib/validation";
import { jsonError, jsonOk, parseJson, zodError } from "@/app/api/_lib/http";

type Ctx = { params: Promise<{ projectId: string; sessionId: string }> };

export async function POST(request: Request, context: Ctx) {
  const { projectId, sessionId } = await context.params;
  const payload = await parseJson(request);
  const parsed = createNoteSchema.safeParse(payload);
  if (!parsed.success) return jsonError(zodError(parsed.error));

  const note = await createNote({
    projectId,
    sessionId,
    ...parsed.data,
  });
  return jsonOk({ note }, 201);
}
