import { db } from "@/lib/db";
import { ensurePinnaForThread, ensurePinnaRuntimeConfig } from "@/app/api/_lib/services/pinna-instance.service";
import { getThreadKnowledge } from "@/app/api/_lib/services/knowledge.service";
import { filterVisibleThreadMessages } from "@/app/api/_lib/services/thread-message.service";
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

function getCurrentClaimFromRemark(value: unknown): string | null {
  if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value)
  ) {
    return null;
  }

  const claim = (value as Record<string, unknown>).claim;

  if (typeof claim !== "string") {
    return null;
  }

  const trimmed = claim.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getClaimFromPinnaRemark(pinnaRemark: unknown) {
  return getCurrentClaimFromRemark(pinnaRemark);
}

const PINNA_AGENT_DEBUG = process.env.PINNA_AGENT_DEBUG === "1";

export async function buildPinnaAgentContext(threadId: string): Promise<{
  runtimeConfig: PinnaAgentRuntimeConfig;
  context: AgentContext;
  thread: RuntimeThread;
  knowledge: ObserverKnowledgeContext;
}> {
  const startedAt = Date.now();
  const pinna = await ensurePinnaForThread(threadId);
  if (!pinna) {
    throw new Error("Pinna not found.");
  }

  const threadLoadedAt = Date.now();

  const thread = await db.chatThread.findUnique({
    where: { id: threadId },
    include: {
      pinna: {
        include: {
          selectedBaseKnowledgeVersion: true,
        },
      },
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

  const visibleMessages = filterVisibleThreadMessages(thread.messages);
  const currentClaim = getClaimFromPinnaRemark(thread.pinna.remark);
  // Cache this compact plain-object shape only if a shared Redis helper becomes available later.
  const runtimeConfigPromise = ensurePinnaRuntimeConfig(thread.pinna.id);
  const knowledgeSnapshotPromise = getThreadKnowledge(threadId);
  const [runtimeConfig, knowledgeSnapshot] = await Promise.all([
    runtimeConfigPromise,
    knowledgeSnapshotPromise,
  ]);

  if (PINNA_AGENT_DEBUG) {
    console.log("[PINNA_TIMING]", {
      step: "buildPinnaAgentContext",
      ms: Date.now() - startedAt,
      threadId,
      visibleMessageCount: visibleMessages.length,
      hasCurrentClaim: Boolean(currentClaim),
      knowledgeSummaryCount: knowledgeSnapshot.summaries.length,
      initialLoadMs: threadLoadedAt - startedAt,
    });
  }

  return {
    runtimeConfig,
    thread: {
      ...thread,
      messages: visibleMessages,
    },
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
      selectedText: thread.note.selectedText || thread.note.capture?.selectedText,
      sourceTitle: thread.note.source?.title,
      currentClaim,
      threadSummary: thread.summary,
      baseKnowledgeVersion: thread.pinna.selectedBaseKnowledgeVersion
        ? {
            version: thread.pinna.selectedBaseKnowledgeVersion.version,
            title: thread.pinna.selectedBaseKnowledgeVersion.title,
            summary: thread.pinna.selectedBaseKnowledgeVersion.summary,
            keyFindings: thread.pinna.selectedBaseKnowledgeVersion.keyFindings,
            userView: thread.pinna.selectedBaseKnowledgeVersion.userView,
            conclusion: thread.pinna.selectedBaseKnowledgeVersion.conclusion,
          }
        : null,
      memoryNamespace: runtimeConfig.memoryNamespace,
    },
    knowledge: {
      currentEventSeq: knowledgeSnapshot.head?.currentEventSeq ?? BigInt(0),
      currentBuildId: knowledgeSnapshot.head?.currentBuildId ?? null,
      currentSummaries: knowledgeSnapshot.summaries.map((summary) => summary.content),
    },
  };
}
