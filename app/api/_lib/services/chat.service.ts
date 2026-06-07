import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { getPinnaTemplateByKey } from "@/app/api/_lib/services/pinna.service";
import {
  createPinnaWithThread,
  ensurePinnaForThread,
  PinnaBaseSelection,
} from "@/app/api/_lib/services/pinna-instance.service";
import { runPinnaThreadTurn } from "@/src/agents/core/agent-orchestrator";

const DEFAULT_THREAD_PAGE_SIZE = 100;

export async function createThread(input: {
  projectId: string;
  sessionId: string;
  noteId: string;
  pinnaTemplateKey: string;
  baseSelection: PinnaBaseSelection;
  title?: string | null;
  customInstructions?: string | null;
}) {
  const template = await getPinnaTemplateByKey(input.pinnaTemplateKey);
  if (!template) {
    throw new Error("Pinna template not found.");
  }

  if (template.scope !== "NOTE") {
    throw new Error("Only note-scoped templates can be created from the note thread API.");
  }

  return createPinnaWithThread({
    projectId: input.projectId,
    sessionId: input.sessionId,
    noteId: input.noteId,
    pinnaTemplateId: template.id,
    pinnaTemplateKey: template.key,
    baseSelection: input.baseSelection,
    title: input.title || template.defaultTitle || null,
    customInstructions: input.customInstructions || null,
  });
}

export async function listThreadsByNote(noteId: string) {
  return db.chatThread.findMany({ where: { noteId }, orderBy: { createdAt: "asc" } });
}

export async function getThread(threadId: string) {
  await ensurePinnaForThread(threadId);

  return db.chatThread.findUnique({
    where: { id: threadId },
    include: { pinnaTemplate: true, pinna: true },
  });
}

export async function getThreadMessagesPage(input: {
  threadId: string;
  limit?: number;
  beforeCreatedAt?: string | null;
  beforeMessageId?: string | null;
}) {
  await ensurePinnaForThread(input.threadId);

  const limit = Math.min(Math.max(input.limit ?? DEFAULT_THREAD_PAGE_SIZE, 1), 100);
  const beforeDate =
    input.beforeCreatedAt && !Number.isNaN(new Date(input.beforeCreatedAt).getTime())
      ? new Date(input.beforeCreatedAt)
      : null;
  const beforeMessageId = input.beforeMessageId?.trim() || null;
  const where: Prisma.ChatMessageWhereInput = {
    threadId: input.threadId,
  };

  if (beforeDate) {
    where.OR = [
      { createdAt: { lt: beforeDate } },
      ...(beforeMessageId
        ? [
            {
              createdAt: beforeDate,
              id: { lt: beforeMessageId },
            } satisfies Prisma.ChatMessageWhereInput,
          ]
        : []),
    ];
  }

  const messages = await db.chatMessage.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const hasOlder = messages.length > limit;
  const page = (hasOlder ? messages.slice(0, limit) : messages).reverse();
  const oldest = page[0] || null;

  return {
    messages: page,
    pageInfo: {
      hasOlder,
      oldestMessageId: oldest?.id || null,
      oldestMessageCreatedAt: oldest?.createdAt.toISOString() || null,
      limit,
    },
  };
}

export async function sendMessage(threadId: string, userMessage: string) {
  await ensurePinnaForThread(threadId);
  const result = await runPinnaThreadTurn({ threadId, userMessage });
  return result.assistantMessage;
}
