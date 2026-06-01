import { db } from "@/lib/db";

export async function getOrCreateTodaySession(projectId: string) {
  const today = new Date();
  const localDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const existing = await db.session.findUnique({
    where: { projectId_sessionKey: { projectId, sessionKey: localDate } },
  });
  if (existing) {
    return { session: existing, created: false as const };
  }

  const session = await db.session.create({
    data: {
      projectId,
      sessionKey: localDate,
      title: `Session ${localDate.toISOString().slice(0, 10)}`,
    },
  });

  return { session, created: true as const };
}

export async function getSession(sessionId: string) {
  return db.session.findUnique({ where: { id: sessionId } });
}

export async function listSessions(projectId: string) {
  return db.session.findMany({ where: { projectId }, orderBy: { sessionKey: "desc" } });
}

export async function updateSessionSummary(sessionId: string, summary: string, _embedding?: number[] | null) {
  return db.session.update({ where: { id: sessionId }, data: { sessionSummary: summary } });
}
