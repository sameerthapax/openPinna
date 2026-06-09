import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { threadMemoryQueue } from "@/app/api/_lib/queues";
import { extractClaimFromSelectedText } from "@/app/api/_lib/services/claim.service";
import { filterVisibleThreadMessages } from "@/app/api/_lib/services/thread-message.service";
import { getPinnaTemplateByKey } from "@/app/api/_lib/services/pinna.service";
import {
  createPinnaWithThread,
  ensurePinnaForThread,
  PinnaBaseSelection,
  resolveNoteBaseKnowledgeVersion,
} from "@/app/api/_lib/services/pinna-instance.service";
import { createThreadKnowledgeEvent } from "@/app/api/_lib/services/knowledge.service";
import { runPinnaThreadTurn } from "@/src/agents/core/agent-orchestrator";

const DEFAULT_THREAD_PAGE_SIZE = 100;

function buildFallbackClaim(input: {
  selectedText: string;
  sourceTitle?: string | null;
}) {
  const sourceTitle = input.sourceTitle?.trim() || "";
  const selectedText = input.selectedText.trim();
  const firstLine = selectedText.split(/\n+/).map((line) => line.trim()).find(Boolean) || "";
  const firstSentence = firstLine.match(/^.+?[.!?](?:\s|$)/)?.[0].trim() || "";
  const core = firstSentence || firstLine || selectedText.slice(0, 220).trim();

  if (!core && sourceTitle) {
    return `The note argues that ${sourceTitle}.`;
  }

  if (!core) {
    return "No precise claim could be extracted from the selected text.";
  }

  return sourceTitle ? `The note claims that ${core}` : core;
}

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

  const note = await db.note.findUnique({
    where: { id: input.noteId },
    include: {
      source: true,
      capture: true,
    },
  });

  if (!note) {
    throw new Error("Note not found.");
  }

  let initialClaim: Awaited<ReturnType<typeof extractClaimFromSelectedText>> | null = null;

  if (template.key === "claim") {
    const baseKnowledgeVersion = await resolveNoteBaseKnowledgeVersion(
        input.noteId,
        input.baseSelection,
    );

    const selectedText = note.selectedText || note.capture?.selectedText || "";

    try {
      initialClaim = await extractClaimFromSelectedText({
        selectedText,
        sourceTitle: note.source?.title || null,
        baseKnowledgeVersion: {
          version: baseKnowledgeVersion.version,
          title: baseKnowledgeVersion.title,
          summary: baseKnowledgeVersion.summary,
          keyFindings: baseKnowledgeVersion.keyFindings,
          userView: baseKnowledgeVersion.userView,
          conclusion: baseKnowledgeVersion.conclusion,
        },
      });
    } catch {
      initialClaim = {
        claim: buildFallbackClaim({
          selectedText,
          sourceTitle: note.source?.title || null,
        }),
        evidence: "",
        uncertainty: "Fallback claim used because extraction failed.",
      };
    }
  }

  const created = await createPinnaWithThread({
    projectId: input.projectId,
    sessionId: input.sessionId,
    noteId: input.noteId,
    pinnaTemplateId: template.id,
    pinnaTemplateKey: template.key,
    baseSelection: input.baseSelection,
    title: input.title || template.defaultTitle || null,
    customInstructions: input.customInstructions || null,
  });

  let updatedPinna = created.pinna;
  const currentClaim = initialClaim?.claim?.trim() || null;

  if (template.key === "claim" && currentClaim) {
    updatedPinna = await db.pinna.update({
      where: { id: created.pinna.id },
      data: {
        remark: {
          claim: currentClaim,
        } as Prisma.InputJsonValue,
      },
      include: {
        pinnaTemplate: {
          include: {
            defaultSkill: true,
          },
        },
        selectedBaseKnowledgeVersion: true,
      },
    });

    await createThreadKnowledgeEvent({
      threadId: created.thread.id,
      eventType: "assistant_message",
      actor: "assistant",
      content: currentClaim,
      payload: {
        role: "assistant",
        content: currentClaim,
        bootstrap: true,
        claimOnly: true,
      } as Prisma.InputJsonValue,
    });

    await threadMemoryQueue.add("thread-memory-refresh", {
      threadId: created.thread.id,
      rebuildKnowledgeSnapshot: false,
      runKnowledgeChain: false,
    });
  }

  const threadWithMessages = await db.chatThread.findUnique({
    where: { id: created.thread.id },
    include: {
      messages: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
      pinnaTemplate: {
        include: {
          defaultSkill: true,
        },
      },
      pinna: true,
    },
  });

  return {
    ...created,
    pinna: updatedPinna,
    currentClaim,
    thread: threadWithMessages
        ? {
          ...threadWithMessages,
          messages: filterVisibleThreadMessages(threadWithMessages.messages),
        }
        : created.thread,
  };
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
  const page = filterVisibleThreadMessages(hasOlder ? messages.slice(0, limit) : messages).reverse();
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
  return runPinnaThreadTurn({ threadId, userMessage });
}
