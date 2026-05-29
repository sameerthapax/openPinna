import { createNoteController, listNotesController } from "./notes.controller";

export async function GET() {
  return listNotesController();
}

export async function POST(request: Request) {
  return createNoteController(request);
}
