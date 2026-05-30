import { listTools } from "@/app/api/_lib/services/tool-registry.service";
import { jsonOk } from "@/app/api/_lib/http";

export async function GET() {
  const tools = await listTools();
  return jsonOk({ tools });
}
