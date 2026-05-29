import {
  createProjectController,
  listProjectsController,
} from "@/app/api/research/research.controller";

export async function GET() {
  return listProjectsController();
}

export async function POST(request: Request) {
  return createProjectController(request);
}
