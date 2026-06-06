import { db } from "@/lib/db";
import { ensurePinnaForThread, ensurePinnaRuntimeConfig } from "@/app/api/_lib/services/pinna-instance.service";
import { getThreadKnowledge } from "@/app/api/_lib/services/knowledge.service";
import { Prisma } from "@prisma/client";
import {
  AgentContext,
  ObserverKnowledgeContext,
  PinnaAgentRuntimeConfig,
} from "@/src/agents/core/agent-types";

type RuntimeThread = Prisma.ChatThreadGetPayload<{
  include: {
    pinna: true;
    pinnaTemplate: {
      include: {
        defaultSkill: true;
      };
    };
    note: {
      include: {
        source: true;
        capture: true;
      };
    };
    messages: true;
  };
}>;

export async function buildPinnaAgentContext(threadId: string): Promise<{
  runtimeConfig: PinnaAgentRuntimeConfig;
  context: AgentContext;
  thread: RuntimeThread;
  knowledge: ObserverKnowledgeContext;
}> {
  const pinna = await ensurePinnaForThread(threadId);
  if (!pinna) {
    throw new Error("Pinna not found.");
  }

  const thread = await db.chatThread.findUnique({
    where: { id: threadId },
    include: {
      pinna: true,
      pinnaTemplate: {
        include: {
          defaultSkill: true,
        },
      },
      note: {
        include: {
          source: true,
          capture: true,
          session: true,
          project: true,
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  if (!thread?.pinna || !thread.pinnaTemplate) {
    throw new Error("Thread runtime context is incomplete.");
  }

  const runtimeConfig = await ensurePinnaRuntimeConfig(thread.pinna.id);
  const knowledgeSnapshot = await getThreadKnowledge(threadId);

  return {
    runtimeConfig,
    thread,
    context: {
      threadId: thread.id,
      pinnaId: thread.pinna.id,
      scope: thread.pinnaTemplate.scope,
      skillKey:
        thread.pinnaTemplate.defaultSkillKey ||
        thread.pinnaTemplate.defaultSkill?.key ||
        thread.pinnaTemplate.key,
      allowShell: thread.pinnaTemplate.allowShell,
      runtimeAllowShell: Boolean((runtimeConfig as { allowShell?: boolean }).allowShell),
      projectId: thread.projectId,
      sessionId: thread.sessionId,
      noteId: thread.noteId,
      templateKey: thread.pinnaTemplate.key,
      customInstructions: thread.customInstructions,
      projectSummary: thread.note.project.projectSummary,
      sessionSummary: thread.note.session.sessionSummary,
      noteText: thread.note.noteText,
      sourceTitle: thread.note.source?.title,
      selectedText: thread.note.capture?.selectedText,
      threadSummary: thread.summary,
      memoryNamespace: runtimeConfig.memoryNamespace,
    },
    knowledge: {
      currentEventSeq: knowledgeSnapshot.head?.currentEventSeq ?? BigInt(0),
      currentBuildId: knowledgeSnapshot.head?.currentBuildId ?? null,
      currentSummaries: knowledgeSnapshot.summaries.map((summary) => summary.content),
    },
  };
}
