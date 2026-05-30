import { db } from "@/lib/db";

export async function createProject(input: {
  title: string;
  description?: string | null;
  userId?: string | null;
}) {
  return db.project.create({
    data: {
      title: input.title.trim(),
      description: input.description?.trim() || null,
      userId: input.userId || null,
    },
  });
}

export async function getProject(projectId: string) {
  return db.project.findUnique({ where: { id: projectId } });
}

export async function listProjects() {
  return db.project.findMany({ orderBy: { createdAt: "desc" } });
}

export async function updateProjectSummary(projectId: string, summary: string, _embedding?: number[] | null) {
  return db.project.update({
    where: { id: projectId },
    data: { projectSummary: summary },
  });
}
