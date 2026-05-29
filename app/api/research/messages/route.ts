import { createMessageController } from "@/app/api/research/research.controller";

export async function POST(request: Request) {
  return createMessageController(request);
}
