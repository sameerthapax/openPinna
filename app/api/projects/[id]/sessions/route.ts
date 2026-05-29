import { createSessionController } from "@/app/api/research/research.controller";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return createSessionController(request, id);
}
