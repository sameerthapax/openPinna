import { getSessionController } from "@/app/api/research/research.controller";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  return getSessionController(id);
}
