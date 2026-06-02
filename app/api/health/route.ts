import { jsonOk } from "@/app/api/_lib/http";

export async function GET() {
  return jsonOk({ status: "ok" });
}
