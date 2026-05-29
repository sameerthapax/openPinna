import {
  deleteNoteController,
  getNoteController,
  patchNoteController,
} from "@/app/api/research/research.controller";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  return getNoteController(id);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return patchNoteController(request, id);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  return deleteNoteController(id);
}
