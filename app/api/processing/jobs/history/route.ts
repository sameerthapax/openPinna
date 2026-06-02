import { jsonOk } from "@/app/api/_lib/http";
import { ensureProcessingDebugAllowed, listHistoryJobs } from "@/app/api/processing/_lib";

export async function GET() {
  const blocked = ensureProcessingDebugAllowed();
  if (blocked) return blocked;

  const jobs = await listHistoryJobs();
  return jsonOk({ jobs });
}
