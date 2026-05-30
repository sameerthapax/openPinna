import { listPinnaTemplates } from "@/app/api/_lib/services/pinna.service";
import { jsonOk } from "@/app/api/_lib/http";

export async function GET() {
  const pinnaTemplates = await listPinnaTemplates();
  return jsonOk({ pinnaTemplates });
}
