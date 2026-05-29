import {
  deleteNoteController,
  getNoteController,
  updateNoteController,
} from "../notes.controller";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return getNoteController(request, id);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return updateNoteController(request, id);
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return deleteNoteController(request, id);
}
