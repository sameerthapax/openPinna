import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { normalizePinnaAgentConfig } from "@/src/agents/core/pinna-agent-config";
import { Mem0MemoryProvider } from "@/src/agents/memory/mem0-provider";
import { buildPinnaMemoryContext } from "@/src/agents/memory/memory-namespace";

export async function listPinnaTemplates() {
  return db.pinnaTemplate.findMany({
    where: { isActive: true, scope: "NOTE" },
    include: {
      defaultSkill: true,
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function getPinnaTemplateByKey(key: string) {
  return db.pinnaTemplate.findFirst({
    where: { key, isActive: true },
    include: {
      defaultSkill: true,
    },
  });
}

export async function getPinnaTemplateById(id: string) {
  return db.pinnaTemplate.findFirst({
    where: { id, isActive: true },
    include: {
      defaultSkill: true,
    },
  });
}

export async function deletePinna(pinnaId: string) {
  const pinna = await db.pinna.findUnique({
    where: { id: pinnaId },
    include: {
      chatThreads: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!pinna) {
    throw new Error("Pinna not found.");
  }

  const runtimeConfig = normalizePinnaAgentConfig(pinna.agentConfig, {
    pinnaId: pinna.id,
    skillKey: "claim",
  });
  const memoryProvider = new Mem0MemoryProvider();
  const memoryContexts = pinna.chatThreads.map((thread) =>
    buildPinnaMemoryContext({
      namespace: runtimeConfig.memoryNamespace,
      pinnaId: pinna.id,
      threadId: thread.id,
      noteId: pinna.noteId,
    }),
  );

  const observerContexts = pinna.chatThreads.map((thread) => ({
    namespace: runtimeConfig.observerNamespace,
    pinnaId: pinna.id,
    threadId: thread.id,
    noteId: pinna.noteId,
  }));

  await db.$transaction(async (tx) => {
    const note = await tx.note.findUnique({
      where: { id: pinna.noteId },
      select: {
        pinnaLayout: true,
      },
    });

    const layout =
      note?.pinnaLayout &&
      typeof note.pinnaLayout === "object" &&
      !Array.isArray(note.pinnaLayout)
        ? (note.pinnaLayout as {
            zoom?: number;
            nodes?: Array<{ id: string; x: number; y: number }>;
          })
        : null;

    if (layout?.nodes) {
      await tx.note.update({
        where: { id: pinna.noteId },
        data: {
          pinnaLayout: {
            ...(layout as Prisma.InputJsonObject),
            nodes: layout.nodes.filter((node) => node.id !== pinna.id),
          } as Prisma.InputJsonValue,
        },
      });
    }

    if (pinna.chatThreads.length > 0) {
      await tx.chatThread.deleteMany({
        where: { pinnaId: pinna.id },
      });
    }

    await tx.pinna.delete({
      where: { id: pinna.id },
    });
  });

  const memoryResult = await memoryProvider.deleteContexts({
    contexts: [...memoryContexts, ...observerContexts],
  });

  return {
    deleted: true,
    memory: memoryResult,
  };
}
