import { db } from "@/lib/db";
import { jsonError } from "@/app/api/_lib/http";

export function ensureProcessingDebugAllowed() {
  if (process.env.NODE_ENV === "production") {
    return jsonError("Processing debug endpoints are disabled in production.", 404);
  }

  return null;
}

export async function listOutboxJobs() {
  return db.processingJobOutbox.findMany({
    orderBy: [{ createdAt: "asc" }],
  });
}

export async function listHistoryJobs() {
  return db.processingJobHistory.findMany({
    orderBy: [{ createdAt: "desc" }],
    take: 100,
  });
}
