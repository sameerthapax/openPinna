import { Worker } from "bullmq";
import { db } from "@/lib/db";
import {
  createKnowledgeEvent,
  rebuildNoteSummary,
  rebuildProjectSummary,
  rebuildSessionSummary,
} from "@/app/api/_lib/services/knowledge.service";
import {
  noteMemoryQueue,
  projectMemoryQueue,
  sessionMemoryQueue,
  threadMemoryQueue,
} from "@/app/api/_lib/queues";
import { summarizeText } from "@/app/api/_lib/ai";

const connection = { url: process.env.REDIS_URL };

new Worker(
  "threadMemoryQueue",
  async (job: any) => {
    const thread = await db.chatThread.findUnique({
      where: { id: job.data.threadId },
      include: { messages: { orderBy: { createdAt: "asc" } }, note: true },
    });
    if (!thread) return;

    const summary = await summarizeText(thread.messages.map((m) => `${m.role}: ${m.content}`), "Thread");
    await db.chatThread.update({ where: { id: thread.id }, data: { summary } });

    await db.knowledgeNode.upsert({
      where: { id: thread.id },
      update: { label: thread.title || thread.threadType, summary, nodeType: "thread", projectId: thread.projectId },
      create: {
        id: thread.id,
        nodeType: "thread",
        label: thread.title || thread.threadType,
        summary,
        projectId: thread.projectId,
        sessionId: thread.sessionId,
        noteId: thread.noteId,
        threadId: thread.id,
      },
    });

    await createKnowledgeEvent({
      projectId: thread.projectId,
      sessionId: thread.sessionId,
      noteId: thread.noteId,
      threadId: thread.id,
      eventType: "thread_summary_updated",
      content: summary,
    });

    await noteMemoryQueue.add("note-memory-refresh", { noteId: thread.noteId });
  },
  { connection },
);

new Worker(
  "noteMemoryQueue",
  async (job: any) => {
    const data = await rebuildNoteSummary(job.data.noteId);
    if (!data) return;

    await db.knowledgeNode.upsert({
      where: { id: data.note.id },
      update: { nodeType: "note", label: `Note ${data.note.id.slice(0, 8)}`, summary: data.summary, projectId: data.note.projectId },
      create: {
        id: data.note.id,
        nodeType: "note",
        label: `Note ${data.note.id.slice(0, 8)}`,
        summary: data.summary,
        projectId: data.note.projectId,
        sessionId: data.note.sessionId,
        noteId: data.note.id,
        sourceId: data.note.sourceId,
      },
    });

    await createKnowledgeEvent({
      projectId: data.note.projectId,
      sessionId: data.note.sessionId,
      noteId: data.note.id,
      eventType: "note_summary_updated",
      content: data.summary,
    });

    await sessionMemoryQueue.add("session-memory-refresh", { sessionId: data.note.sessionId });
  },
  { connection },
);

new Worker("sessionMemoryQueue", async (job: any) => {
  const summary = await rebuildSessionSummary(job.data.sessionId);
  const session = await db.session.findUnique({ where: { id: job.data.sessionId } });
  if (!session) return;
  await db.knowledgeNode.upsert({
    where: { id: session.id },
    update: { nodeType: "session", label: session.title || session.sessionKey.toISOString().slice(0, 10), summary, projectId: session.projectId },
    create: {
      id: session.id,
      nodeType: "session",
      label: session.title || session.sessionKey.toISOString().slice(0, 10),
      summary,
      projectId: session.projectId,
      sessionId: session.id,
    },
  });

  await createKnowledgeEvent({
    projectId: session.projectId,
    sessionId: session.id,
    eventType: "session_summary_updated",
    content: summary,
  });

  await projectMemoryQueue.add("project-memory-refresh", { projectId: session.projectId });
}, { connection });

new Worker("projectMemoryQueue", async (job: any) => {
  const summary = await rebuildProjectSummary(job.data.projectId);
  const project = await db.project.findUnique({ where: { id: job.data.projectId } });
  if (project) {
    await db.knowledgeNode.upsert({
      where: { id: project.id },
      update: { nodeType: "project", label: project.title, summary, projectId: project.id },
      create: {
        id: project.id,
        nodeType: "project",
        label: project.title,
        summary,
        projectId: project.id,
      },
    });
  }
  const firstSession = await db.session.findFirst({ where: { projectId: job.data.projectId } });
  if (!firstSession) return;
  await createKnowledgeEvent({
    projectId: job.data.projectId,
    sessionId: firstSession.id,
    eventType: "project_summary_updated",
    content: summary,
  });
}, { connection });

new Worker("graphQueue", async (job: any) => {
  const projectId: string | undefined = job.data.projectId;
  if (!projectId) return;

  const sessions = await db.session.findMany({ where: { projectId } });
  for (const session of sessions) {
    const notes = await db.note.findMany({ where: { sessionId: session.id } });
    for (const note of notes) {
      const threads = await db.chatThread.findMany({ where: { noteId: note.id } });
      for (const thread of threads) {
        await db.knowledgeEdge.create({
          data: {
            fromNodeId: note.id,
            toNodeId: thread.id,
            edgeType: "belongs_to",
          },
        }).catch(() => undefined);
      }

      await db.knowledgeEdge.create({
        data: {
          fromNodeId: session.id,
          toNodeId: note.id,
          edgeType: "belongs_to",
        },
      }).catch(() => undefined);
    }

    await db.knowledgeEdge.create({
      data: {
        fromNodeId: projectId,
        toNodeId: session.id,
        edgeType: "belongs_to",
      },
    }).catch(() => undefined);
  }
}, { connection });

new Worker("sourceProcessingQueue", async (job: any) => {
  // TODO: integrate real source extraction and PDF parsing when available.
  await db.source.update({ where: { id: job.data.sourceId }, data: { metadata: { extractionStatus: "pending_manual" } } });
}, { connection });
