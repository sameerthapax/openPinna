import { db } from "@/lib/db";
import { summarizeText, maybeEmbed } from "@/app/api/_lib/ai";
import { updateNoteSummary } from "@/app/api/_lib/services/note.service";
import { updateProjectSummary } from "@/app/api/_lib/services/project.service";
import { updateSessionSummary } from "@/app/api/_lib/services/session.service";
import { Prisma } from "@prisma/client";

export async function createKnowledgeEvent(input: {
  projectId: string;
  sessionId: string;
  noteId?: string | null;
  threadId?: string | null;
  eventType: string;
  content: string;
  importanceScore?: number;
  confidenceScore?: number;
}) {
  if (input.threadId) {
    return db.$transaction(async (tx) => {
      const maxSeq = await tx.knowledgeEvent.aggregate({
        where: { threadId: input.threadId },
        _max: { seq: true },
      });
      const nextSeq = Number(maxSeq._max.seq ?? 0) + 1;

      return tx.knowledgeEvent.create({
        data: {
          ...input,
          seq: nextSeq,
          actor: "system",
          occurredAt: new Date(),
          payload: {
            eventType: input.eventType,
            content: input.content,
            importanceScore: input.importanceScore ?? 0,
            confidenceScore: input.confidenceScore ?? 0,
          } satisfies Prisma.InputJsonValue,
          importanceScore: input.importanceScore ?? 0,
          confidenceScore: input.confidenceScore ?? 0,
        },
      });
    });
  }

  return db.knowledgeEvent.create({
    data: {
      ...input,
      importanceScore: input.importanceScore ?? 0,
      confidenceScore: input.confidenceScore ?? 0,
    },
  });
}

export async function createThreadKnowledgeEvent(input: {
  threadId: string;
  eventType: string;
  actor?: string;
  messageRef?: string;
  payload?: Prisma.InputJsonValue;
  content?: string;
  importanceScore?: number;
  confidenceScore?: number;
  supersedesEventId?: string;
}) {
  const thread = await db.chatThread.findUnique({ where: { id: input.threadId } });
  if (!thread) throw new Error("Thread not found.");

  return db.$transaction(async (tx) => {
    const maxSeq = await tx.knowledgeEvent.aggregate({
      where: { threadId: input.threadId },
      _max: { seq: true },
    });
    const nextSeq = Number(maxSeq._max.seq ?? 0) + 1;

    return tx.knowledgeEvent.create({
      data: {
        projectId: thread.projectId,
        sessionId: thread.sessionId,
        noteId: thread.noteId,
        threadId: thread.id,
        seq: nextSeq,
        eventType: input.eventType,
        actor: input.actor || "system",
        messageRef: input.messageRef || null,
        payload:
          input.payload ||
          ({
            eventType: input.eventType,
            content: input.content || "",
          } satisfies Prisma.InputJsonValue),
        supersedesEventId: input.supersedesEventId || null,
        occurredAt: new Date(),
        content: input.content || JSON.stringify(input.payload || {}),
        importanceScore: input.importanceScore ?? 0,
        confidenceScore: input.confidenceScore ?? 0,
      },
    });
  });
}

export async function acceptKnowledgeEvent(eventId: string) {
  return db.knowledgeEvent.update({ where: { id: eventId }, data: { status: "accepted" } });
}
export async function rejectKnowledgeEvent(eventId: string) {
  return db.knowledgeEvent.update({ where: { id: eventId }, data: { status: "rejected" } });
}
export async function promoteKnowledgeEvent(eventId: string) {
  return db.knowledgeEvent.update({ where: { id: eventId }, data: { status: "promoted" } });
}

export async function rebuildSessionSummary(sessionId: string) {
  const notes = await db.note.findMany({
    where: { sessionId },
    include: { chatThreads: true },
  });
  const parts = notes.flatMap((n) => [n.noteSummary || n.noteText, ...n.chatThreads.map((t) => t.summary || "")]);
  const summary = await summarizeText(parts, "Session");
  const embedding = await maybeEmbed(summary);
  await updateSessionSummary(sessionId, summary, embedding);
  return summary;
}

export async function rebuildProjectSummary(projectId: string) {
  const sessions = await db.session.findMany({ where: { projectId } });
  const summary = await summarizeText(
    sessions.map((s) => s.sessionSummary || ""),
    "Project",
  );
  const embedding = await maybeEmbed(summary);
  await updateProjectSummary(projectId, summary, embedding);
  return summary;
}

export async function rebuildNoteSummary(noteId: string) {
  const note = await db.note.findUnique({ where: { id: noteId }, include: { chatThreads: true } });
  if (!note) return null;
  const summary = await summarizeText(
    [note.noteText, ...note.chatThreads.map((t) => t.summary || "")],
    "Note",
  );
  const embedding = await maybeEmbed(summary);
  await updateNoteSummary(note.id, summary, embedding);
  return { summary, note };
}

export async function buildThreadKnowledgeSnapshot(threadId: string) {
  const thread = await db.chatThread.findUnique({
    where: { id: threadId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      note: true,
    },
  });
  if (!thread) throw new Error("Thread not found.");

  const events = await db.knowledgeEvent.findMany({
    where: { threadId },
    orderBy: [{ seq: "asc" }, { createdAt: "asc" }],
  });

  const head = await db.threadKnowledgeHead.findUnique({ where: { threadId } });
  const lastVersion = await db.knowledgeBuild.findFirst({
    where: { threadId },
    orderBy: { buildVersion: "desc" },
  });

  const parentBuildId = lastVersion?.id || null;
  const buildVersion = (lastVersion?.buildVersion ?? 0) + 1;
  const eventSeqFrom = Number(head?.currentEventSeq ?? 0) + 1;
  const eventSeqTo = Number(events.at(-1)?.seq ?? 0);

  if (eventSeqTo < eventSeqFrom) {
    return { unchanged: true, head };
  }

  const threadSummary = await summarizeText(
    thread.messages.map((m) => `${m.role}: ${m.content}`),
    "Thread",
  );

  return db.$transaction(async (tx) => {
    const build = await tx.knowledgeBuild.create({
      data: {
        threadId,
        buildVersion,
        parentBuildId,
        eventSeqFrom,
        eventSeqTo,
        status: "complete",
        generator: "rules-v1",
        eventFromId: events.find((e) => Number(e.seq ?? 0) === eventSeqFrom)?.id || null,
        eventToId: events.find((e) => Number(e.seq ?? 0) === eventSeqTo)?.id || null,
      },
    });

    const nodeByType = new Map<string, string>();
    const upsertNode = async (stableKey: string, nodeType: string, title: string, body: string) => {
      const node = await tx.knowledgeNode.create({
        data: {
          projectId: thread.projectId,
          sessionId: thread.sessionId,
          noteId: thread.noteId,
          threadId: thread.id,
          buildId: build.id,
          stableKey,
          nodeType,
          label: title,
          summary: body,
          body,
          state: "active",
          metadata: {},
        },
      });
      nodeByType.set(stableKey, node.id);
      return node;
    };

    await upsertNode(`thread:${thread.id}:summary`, "summary_anchor", thread.title || thread.threadType, threadSummary);
    for (const event of events) {
      await upsertNode(
        `event:${event.id}`,
        event.eventType,
        event.eventType.replaceAll("_", " "),
        event.content,
      );
    }

    const summaryNodeId = nodeByType.get(`thread:${thread.id}:summary`);
    if (summaryNodeId) {
      for (const event of events) {
        const eventNodeId = nodeByType.get(`event:${event.id}`);
        if (!eventNodeId) continue;
        await tx.knowledgeEdge.create({
          data: {
            threadId: thread.id,
            buildId: build.id,
            fromNodeId: summaryNodeId,
            toNodeId: eventNodeId,
            edgeType: "refines",
            metadata: {},
          },
        });
      }
    }

    await tx.knowledgeSummary.createMany({
      data: [
        {
          threadId: thread.id,
          buildId: build.id,
          summaryType: "base",
          content: threadSummary,
          format: "markdown",
          generator: "rules-v1",
        },
        {
          threadId: thread.id,
          buildId: build.id,
          summaryType: "events",
          content: events.map((e) => `#${e.seq} ${e.eventType}: ${e.content}`).join("\n"),
          format: "markdown",
          generator: "rules-v1",
        },
      ],
    });

    await tx.threadKnowledgeHead.upsert({
      where: { threadId: thread.id },
      update: {
        currentBuildId: build.id,
        currentEventSeq: BigInt(eventSeqTo),
      },
      create: {
        threadId: thread.id,
        currentBuildId: build.id,
        currentEventSeq: BigInt(eventSeqTo),
      },
    });

    return build;
  });
}

export async function getThreadKnowledge(threadId: string) {
  const head = await db.threadKnowledgeHead.findUnique({
    where: { threadId },
    include: { currentBuild: true },
  });
  if (!head?.currentBuildId) {
    return { head, build: null, nodes: [], edges: [], summaries: [] };
  }

  const [nodes, edges, summaries] = await Promise.all([
    db.knowledgeNode.findMany({
      where: { threadId, buildId: head.currentBuildId },
      orderBy: { createdAt: "asc" },
    }),
    db.knowledgeEdge.findMany({
      where: { threadId, buildId: head.currentBuildId },
      orderBy: { createdAt: "asc" },
    }),
    db.knowledgeSummary.findMany({
      where: { threadId, buildId: head.currentBuildId },
      orderBy: { summaryType: "asc" },
    }),
  ]);

  return {
    head,
    build: head.currentBuild,
    nodes,
    edges,
    summaries,
  };
}
