import { Worker } from "bullmq";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  buildThreadKnowledgeSnapshot,
  createKnowledgeEvent,
  createThreadKnowledgeEvent,
  rebuildNoteSummary,
  rebuildProjectSummary,
  rebuildSessionSummary,
} from "@/app/api/_lib/services/knowledge.service";
import {
  noteMemoryQueue,
  pinnaObserverQueue,
  projectMemoryQueue,
  sessionMemoryQueue,
  threadMemoryQueue,
} from "@/app/api/_lib/queues";
import { summarizeText } from "@/app/api/_lib/ai";
import { pinnaObserverDefinition } from "@/src/agents/observer/pinna-observer";
import { ensurePinnaForThread } from "@/app/api/_lib/services/pinna-instance.service";
import { filterVisibleThreadMessages } from "@/app/api/_lib/services/thread-message.service";
import { Mem0MemoryProvider } from "@/src/agents/memory/mem0-provider";
import type { MemoryProviderContext } from "@/src/agents/memory/memory-provider";

const connection = { url: process.env.REDIS_URL };
const OBSERVER_BATCH_SIZE = 30;
const OBSERVER_BATCH_ROLE_TARGET = 15;
const PINNA_AGENT_DEBUG = process.env.PINNA_AGENT_DEBUG === "1";

type QueueJob<TData extends Record<string, unknown>> = {
  data: TData;
  name: string;
};

type ThreadMemoryQueueJobData = {
  threadId: string;
  rebuildKnowledgeSnapshot?: boolean;
  runKnowledgeChain?: boolean;
  memoryContext?: MemoryProviderContext;
  userMessage?: string;
  assistantMessage?: string;
};

type ThreadMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
};

type ObserverCursorEvent = {
  id: string;
  createdAt: Date;
  content: string | null;
  payload: Prisma.JsonValue | null;
};

function readObserverCursorMessageId(event: ObserverCursorEvent | null) {
  if (!event?.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) {
    return null;
  }

  const lastObservedMessageId = (event.payload as Record<string, unknown>)
    .lastObservedMessageId;
  return typeof lastObservedMessageId === "string" && lastObservedMessageId.trim().length > 0
    ? lastObservedMessageId
    : null;
}

function getPendingObserverMessages(
  messages: ThreadMessage[],
  lastObserverEvent: ObserverCursorEvent | null,
) {
  const lastObservedMessageId = readObserverCursorMessageId(lastObserverEvent);
  if (lastObservedMessageId) {
    const cursorIndex = messages.findIndex((message) => message.id === lastObservedMessageId);
    if (cursorIndex >= 0) {
      return messages.slice(cursorIndex + 1);
    }
  }

  if (lastObserverEvent) {
    return messages.filter((message) => message.createdAt > lastObserverEvent.createdAt);
  }

  return messages;
}

function getObserverBatchWindow(
  messages: ThreadMessage[],
  lastObserverEvent: ObserverCursorEvent | null,
) {
  const pendingMessages = getPendingObserverMessages(messages, lastObserverEvent);
  if (pendingMessages.length < OBSERVER_BATCH_SIZE) {
    return null;
  }

  const batchMessages = pendingMessages.slice(0, OBSERVER_BATCH_SIZE);
  const userCount = batchMessages.filter((message) => message.role === "user").length;
  const assistantCount = batchMessages.filter((message) => message.role === "assistant").length;

  if (
    userCount !== OBSERVER_BATCH_ROLE_TARGET ||
    assistantCount !== OBSERVER_BATCH_ROLE_TARGET
  ) {
    return null;
  }

  return {
    batchMessages,
    lastObservedMessageId: batchMessages[batchMessages.length - 1]?.id || null,
    previousWindowSummary: lastObserverEvent?.content || null,
  };
}

new Worker(
  "threadMemoryQueue",
  async (
    job: QueueJob<ThreadMemoryQueueJobData>,
  ) => {
    if (job.name === "thread-memory-append") {
      const startedAt = Date.now();
      const memoryProvider = new Mem0MemoryProvider();
      if (!job.data.memoryContext || !job.data.userMessage || !job.data.assistantMessage) {
        console.error("[PINNA_TIMING]", {
          step: "memory_append_write_failed",
          threadId: job.data.threadId,
          detail: "Missing memory append payload.",
        });
        return;
      }

      const memoryWrite = await memoryProvider.appendTurn({
        context: job.data.memoryContext,
        userMessage: job.data.userMessage,
        assistantMessage: job.data.assistantMessage,
      });

      if (PINNA_AGENT_DEBUG) {
        console.log("[PINNA_TIMING]", {
          step: "memory_append_write",
          ms: Date.now() - startedAt,
          threadId: job.data.threadId,
          memoryNamespace: job.data.memoryContext.namespace,
          userMessageLength: job.data.userMessage.length,
          assistantLength: job.data.assistantMessage.length,
          ok: memoryWrite.ok,
          degraded: memoryWrite.degraded,
        });
      }

      if (!memoryWrite.ok) {
        console.error("[PINNA_TIMING]", {
          step: "memory_append_write_failed",
          threadId: job.data.threadId,
          detail: memoryWrite.detail || "Mem0 append failed.",
        });
      }

      return;
    }

    const thread = await db.chatThread.findUnique({
      where: { id: job.data.threadId },
      include: { messages: { orderBy: { createdAt: "asc" } }, note: true, pinna: true },
    });
    if (!thread) return;

    const visibleMessages = filterVisibleThreadMessages(thread.messages);
    const messageLines = visibleMessages.map((m) => `${m.role}: ${m.content}`);
    const summary = await summarizeText(messageLines, "Thread");
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

    await createThreadKnowledgeEvent({
      threadId: thread.id,
      eventType: "thread_summary_updated",
      content: summary,
    });

    if (job.data.rebuildKnowledgeSnapshot) {
      await buildThreadKnowledgeSnapshot(thread.id);
      if (job.data.runKnowledgeChain) {
        await noteMemoryQueue.add("note-memory-refresh", { noteId: thread.noteId });
      }
    }

    if (!thread.pinna) {
      await ensurePinnaForThread(thread.id);
    }

    const pinnaId = thread.pinna?.id
      || (await ensurePinnaForThread(thread.id))?.id
      || null;

    const lastObserverEvent = pinnaId
      ? await db.pinnaKnowledgeEvent.findFirst({
          where: {
            pinnaId,
            eventType: "observer_window_summary",
          },
          orderBy: [{ seq: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            createdAt: true,
            content: true,
            payload: true,
          },
        })
      : null;

    const observerBatch = getObserverBatchWindow(
      visibleMessages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      })),
      lastObserverEvent,
    );

    if (observerBatch) {
      await pinnaObserverQueue.add("pinna-observer-batch", {
        threadId: thread.id,
      });
    }
  },
  { connection },
);

new Worker(
  "noteMemoryQueue",
  async (job: QueueJob<{ noteId: string }>) => {
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

new Worker("sessionMemoryQueue", async (job: QueueJob<{ sessionId: string }>) => {
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

new Worker("projectMemoryQueue", async (job: QueueJob<{ projectId: string }>) => {
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

new Worker(
  "pinnaObserverQueue",
  async (job: QueueJob<{ threadId: string }>) => {
    const threadId: string | undefined = job.data.threadId;
    if (!threadId) return;

    const thread = await db.chatThread.findUnique({
      where: { id: threadId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        pinna: true,
      },
    });
    if (!thread) return;

    const pinna = await ensurePinnaForThread(threadId);
    if (!pinna) return;

    const knowledgeSnapshot = await import("@/app/api/_lib/services/knowledge.service").then(
      (module) => module.getThreadKnowledge(threadId),
    );

    const lastObserverEvent = await db.pinnaKnowledgeEvent.findFirst({
      where: {
        pinnaId: pinna.id,
        eventType: "observer_window_summary",
      },
      orderBy: [{ seq: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        createdAt: true,
        content: true,
        payload: true,
      },
    });

    const observerBatch = getObserverBatchWindow(
      filterVisibleThreadMessages(thread.messages).map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      })),
      lastObserverEvent,
    );

    if (!observerBatch) return;

    const recentMessages = observerBatch.batchMessages.map((message) => ({
      role: message.role,
      content: message.content,
    }));

    const observerDecision = await pinnaObserverDefinition.run({
      knowledge: {
        currentEventSeq: knowledgeSnapshot.head?.currentEventSeq ?? BigInt(0),
        currentBuildId: knowledgeSnapshot.head?.currentBuildId ?? null,
        currentSummaries: knowledgeSnapshot.summaries.map((summary) => summary.content),
      },
      threadSummary: thread.summary || null,
      previousWindowSummary: observerBatch.previousWindowSummary,
      recentMessages,
      messageCount: filterVisibleThreadMessages(thread.messages).length,
    });

    const shouldRebuildKnowledge = observerDecision.shouldRebuildKnowledge;
    const shouldRunChainRebuild = shouldRebuildKnowledge && observerDecision.shouldRunChainRebuild;

    await createThreadKnowledgeEvent({
      threadId: thread.id,
      eventType: "observer_window_summary",
      actor: "observer",
      content: observerDecision.summary || thread.summary || "",
      payload: {
        summaryLabel: observerDecision.summaryLabel || "observer_window",
        windowMessageCount: observerDecision.windowMessageCount || recentMessages.length,
        shouldEmit: observerDecision.shouldEmit,
        shouldRebuildKnowledge,
        shouldRunChainRebuild,
        eventType: observerDecision.eventType,
        reason: observerDecision.reason,
        priority: observerDecision.priority,
        lastObservedMessageId: observerBatch.lastObservedMessageId,
      } as Prisma.InputJsonValue,
    });

    if (shouldRebuildKnowledge) {
      await threadMemoryQueue.add("thread-memory-refresh", {
        threadId,
        rebuildKnowledgeSnapshot: true,
        runKnowledgeChain: shouldRunChainRebuild,
      });
    }
  },
  { connection },
);

new Worker("graphQueue", async (job: QueueJob<{ projectId?: string }>) => {
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

new Worker("sourceProcessingQueue", async (job: QueueJob<{ sourceId: string }>) => {
  // TODO: integrate real source extraction and PDF parsing when available.
  await db.source.update({ where: { id: job.data.sourceId }, data: { metadata: { extractionStatus: "pending_manual" } } });
}, { connection });
