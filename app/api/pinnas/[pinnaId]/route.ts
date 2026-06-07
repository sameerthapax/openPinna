import { jsonError, jsonOk } from "@/app/api/_lib/http";
import { deletePinna } from "@/app/api/_lib/services/pinna.service";

type Ctx = { params: Promise<{ pinnaId: string }> };

export async function DELETE(_request: Request, context: Ctx) {
  const { pinnaId } = await context.params;

  try {
    const result = await deletePinna(pinnaId);
    return jsonOk(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete pinna.";
    return jsonError(message, message === "Pinna not found." ? 404 : 400);
  }
}
