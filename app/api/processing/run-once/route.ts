import { jsonError, jsonOk } from "@/app/api/_lib/http";
import { ensureProcessingDebugAllowed } from "@/app/api/processing/_lib";
import { runProcessingSchedulerOnce } from "@/src/processing";

export async function POST() {
  const blocked = ensureProcessingDebugAllowed();
  if (blocked) return blocked;

  try {
    const result = await runProcessingSchedulerOnce();
    return jsonOk({ result });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Processing run failed.", 500);
  }
}
