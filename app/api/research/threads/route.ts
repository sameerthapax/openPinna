import { createThreadController } from "@/app/api/research/research.controller";

export async function POST(request: Request) {
  return createThreadController(request);
}
