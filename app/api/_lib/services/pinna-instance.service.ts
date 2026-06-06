import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizePinnaAgentConfig } from "@/src/agents/core/pinna-agent-config";

type DbLike = Prisma.TransactionClient | typeof db;

export type PinnaBaseSelection = "current" | "first";

function asJson(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function normalizeAuthors(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
  );
}

export async function ensureNoteBaseKnowledgeHead(noteId: string, tx: DbLike = db) {
  const existingHead = await tx.noteBaseKnowledgeHead.findUnique({
    where: { noteId },
    include: { currentVersion: true },
  });

  if (existingHead?.currentVersion) {
    return existingHead;
  }

  const existingVersions = await tx.noteBaseKnowledgeVersion.findMany({
    where: { noteId },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    take: 1,
  });

  if (existingVersions[0]) {
    return tx.noteBaseKnowledgeHead.upsert({
      where: { noteId },
      update: {
        currentVersionId: existingVersions[0].id,
        currentVersionNumber: existingVersions[0].version,
        updatedAt: new Date(),
      },
      create: {
        noteId,
        currentVersionId: existingVersions[0].id,
        currentVersionNumber: existingVersions[0].version,
      },
      include: { currentVersion: true },
    });
  }

  const note = await tx.note.findUnique({
    where: { id: noteId },
    include: {
      source: true,
      noteKnowledge: true,
      linkedNoteKnowledge: true,
    },
  });

  if (!note) {
    return null;
  }

  const legacyKnowledge = note.linkedNoteKnowledge || note.noteKnowledge;
  if (!legacyKnowledge) {
    return null;
  }

  const version = await tx.noteBaseKnowledgeVersion.create({
    data: {
      noteId: note.id,
      sourceId: note.sourceId,
      projectId: note.projectId,
      sessionId: note.sessionId,
      version: 1,
      title: legacyKnowledge.title,
      authors: asJson(normalizeAuthors(legacyKnowledge.authors)),
      publicationDate: legacyKnowledge.publicationDate,
      abstract: legacyKnowledge.abstract,
      summary: legacyKnowledge.summary,
      keyFindings: legacyKnowledge.keyFindings,
      userView: legacyKnowledge.userView,
      conclusion: legacyKnowledge.conclusion,
      model: legacyKnowledge.model,
      sourceSnapshot: asJson(legacyKnowledge.sourceSnapshot),
      createdAt: legacyKnowledge.createdAt,
    },
  });

  return tx.noteBaseKnowledgeHead.upsert({
    where: { noteId },
    update: {
      currentVersionId: version.id,
      currentVersionNumber: version.version,
      updatedAt: new Date(),
    },
    create: {
      noteId,
      currentVersionId: version.id,
      currentVersionNumber: version.version,
    },
    include: { currentVersion: true },
  });
}

export async function createNoteBaseKnowledgeVersion(
  input: {
    noteId: string;
    sourceId?: string | null;
    projectId?: string | null;
    sessionId?: string | null;
    title?: string | null;
    authors?: string[];
    publicationDate?: string | null;
    abstract?: string | null;
    summary?: string | null;
    keyFindings: string;
    userView: string;
    conclusion: string;
    model?: string | null;
    sourceSnapshot?: Prisma.InputJsonValue;
  },
  tx: DbLike = db,
) {
  const latest = await tx.noteBaseKnowledgeVersion.findFirst({
    where: { noteId: input.noteId },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const version = await tx.noteBaseKnowledgeVersion.create({
    data: {
      noteId: input.noteId,
      sourceId: input.sourceId || null,
      projectId: input.projectId || null,
      sessionId: input.sessionId || null,
      version: (latest?.version ?? 0) + 1,
      title: input.title || null,
      authors: asJson(input.authors || []),
      publicationDate: input.publicationDate || null,
      abstract: input.abstract || null,
      summary: input.summary || null,
      keyFindings: input.keyFindings,
      userView: input.userView,
      conclusion: input.conclusion,
      model: input.model || null,
      sourceSnapshot: input.sourceSnapshot || asJson({}),
    },
  });

  await tx.noteBaseKnowledgeHead.upsert({
    where: { noteId: input.noteId },
    update: {
      currentVersionId: version.id,
      currentVersionNumber: version.version,
      updatedAt: new Date(),
    },
    create: {
      noteId: input.noteId,
      currentVersionId: version.id,
      currentVersionNumber: version.version,
    },
  });

  return version;
}

export async function listNoteBaseKnowledgeVersions(noteId: string) {
  await ensureNoteBaseKnowledgeHead(noteId);

  const [head, versions] = await Promise.all([
    db.noteBaseKnowledgeHead.findUnique({
      where: { noteId },
      include: { currentVersion: true },
    }),
    db.noteBaseKnowledgeVersion.findMany({
      where: { noteId },
      orderBy: [{ version: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        version: true,
        title: true,
        summary: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    head,
    versions,
    firstVersion: versions[0] || null,
    currentVersion:
      versions.find((version) => version.id === head?.currentVersionId) ||
      versions[versions.length - 1] ||
      null,
  };
}

export async function resolveNoteBaseKnowledgeVersion(
  noteId: string,
  baseSelection: PinnaBaseSelection,
  tx: DbLike = db,
) {
  await ensureNoteBaseKnowledgeHead(noteId, tx);

  const versions = await tx.noteBaseKnowledgeVersion.findMany({
    where: { noteId },
    orderBy: [{ version: "asc" }, { createdAt: "asc" }],
  });

  if (versions.length === 0) {
    throw new Error("Base knowledge is not ready for this note.");
  }

  if (baseSelection === "first") {
    return versions[0];
  }

  return versions[versions.length - 1];
}

export async function ensurePinnaForThread(threadId: string, tx: DbLike = db) {
  const thread = await tx.chatThread.findUnique({
    where: { id: threadId },
    include: {
      pinna: {
        include: {
          pinnaTemplate: {
            include: {
              defaultSkill: true,
            },
          },
          selectedBaseKnowledgeVersion: true,
        },
      },
      pinnaTemplate: {
        include: {
          defaultSkill: true,
        },
      },
    },
  });

  if (!thread) {
    return null;
  }

  if (thread.pinna) {
    const skillKey =
      thread.pinnaTemplate?.defaultSkillKey ||
      thread.pinnaTemplate?.defaultSkill?.key ||
      thread.pinnaTemplate?.key ||
      thread.threadType;
    const agentConfig = normalizePinnaAgentConfig(thread.pinna.agentConfig, {
      pinnaId: thread.pinna.id,
      skillKey,
    });

    const requiresUpdate =
      JSON.stringify(thread.pinna.agentConfig ?? null) !== JSON.stringify(agentConfig);

    if (!requiresUpdate) {
      return thread.pinna;
    }

    await tx.pinna.update({
      where: { id: thread.pinna.id },
      data: {
        agentMode: "server-run-loop",
        agentConfig: agentConfig as Prisma.InputJsonValue,
      },
    });

    return tx.pinna.findUnique({
      where: { id: thread.pinna.id },
      include: {
        pinnaTemplate: {
          include: {
            defaultSkill: true,
          },
        },
        selectedBaseKnowledgeVersion: true,
      },
    });
  }

  const baseVersion = await resolveNoteBaseKnowledgeVersion(thread.noteId, "current", tx);

  const pinna = await tx.pinna.create({
    data: {
      projectId: thread.projectId,
      sessionId: thread.sessionId,
      noteId: thread.noteId,
      pinnaTemplateId: thread.pinnaTemplateId,
      selectedBaseKnowledgeVersionId: baseVersion.id,
      title: thread.title,
      status: thread.status,
      agentMode: "server-run-loop",
    },
  });

  const normalizedConfig = normalizePinnaAgentConfig(pinna.agentConfig, {
    pinnaId: pinna.id,
    skillKey:
      thread.pinnaTemplate?.defaultSkillKey ||
      thread.pinnaTemplate?.defaultSkill?.key ||
      thread.pinnaTemplate?.key ||
      thread.threadType,
  });

  await tx.pinna.update({
    where: { id: pinna.id },
    data: {
      agentMode: "server-run-loop",
      agentConfig: normalizedConfig as Prisma.InputJsonValue,
    },
  });

  await tx.chatThread.update({
    where: { id: thread.id },
    data: { pinnaId: pinna.id },
  });

  return tx.pinna.findUnique({
    where: { id: pinna.id },
    include: {
      pinnaTemplate: {
        include: {
          defaultSkill: true,
        },
      },
      selectedBaseKnowledgeVersion: true,
    },
  });
}

export async function createPinnaWithThread(input: {
  projectId: string;
  sessionId: string;
  noteId: string;
  pinnaTemplateId: string;
  pinnaTemplateKey: string;
  title?: string | null;
  customInstructions?: string | null;
  baseSelection: PinnaBaseSelection;
}) {
  return db.$transaction(async (tx) => {
    const baseVersion = await resolveNoteBaseKnowledgeVersion(
      input.noteId,
      input.baseSelection,
      tx,
    );

    const pinna = await tx.pinna.create({
      data: {
        projectId: input.projectId,
        sessionId: input.sessionId,
        noteId: input.noteId,
        pinnaTemplateId: input.pinnaTemplateId,
        selectedBaseKnowledgeVersionId: baseVersion.id,
        title: input.title || null,
        status: "active",
        agentMode: "server-run-loop",
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

    const agentConfig = normalizePinnaAgentConfig(pinna.agentConfig, {
      pinnaId: pinna.id,
      skillKey: input.pinnaTemplateKey,
    });

    const hydratedPinna = await tx.pinna.update({
      where: { id: pinna.id },
      data: {
        agentConfig: agentConfig as Prisma.InputJsonValue,
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

    const thread = await tx.chatThread.create({
      data: {
        projectId: input.projectId,
        sessionId: input.sessionId,
        noteId: input.noteId,
        pinnaId: pinna.id,
        pinnaTemplateId: input.pinnaTemplateId,
        threadType: input.pinnaTemplateKey,
        title: input.title || null,
        customInstructions: input.customInstructions || null,
      },
      include: {
        messages: true,
        pinnaTemplate: {
          include: {
            defaultSkill: true,
          },
        },
      },
    });

    return { pinna: hydratedPinna, thread, baseVersion };
  });
}

export async function listPinnasByNote(noteId: string) {
  const pinnas = await db.pinna.findMany({
    where: { noteId },
    include: {
      pinnaTemplate: {
        include: {
          defaultSkill: true,
        },
      },
      selectedBaseKnowledgeVersion: true,
      chatThreads: {
        include: {
          _count: {
            select: {
              messages: true,
            },
          },
          messages: { take: 100, orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (pinnas.length > 0) {
    return pinnas;
  }

  const legacyThreads = await db.chatThread.findMany({
    where: { noteId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  for (const thread of legacyThreads) {
    await ensurePinnaForThread(thread.id);
  }

  return db.pinna.findMany({
    where: { noteId },
    include: {
      pinnaTemplate: {
        include: {
          defaultSkill: true,
        },
      },
      selectedBaseKnowledgeVersion: true,
      chatThreads: {
        include: {
          _count: {
            select: {
              messages: true,
            },
          },
          messages: { take: 100, orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function ensurePinnaRuntimeConfig(
  pinnaId: string,
  tx: DbLike = db,
) {
  const pinna = await tx.pinna.findUnique({
    where: { id: pinnaId },
    include: {
      pinnaTemplate: {
        include: {
          defaultSkill: true,
        },
      },
    },
  });

  if (!pinna) {
    throw new Error("Pinna not found.");
  }

  const skillKey =
    pinna.pinnaTemplate?.defaultSkillKey ||
    pinna.pinnaTemplate?.defaultSkill?.key ||
    pinna.pinnaTemplate?.key ||
    "claim";
  const agentConfig = normalizePinnaAgentConfig(pinna.agentConfig, {
    pinnaId: pinna.id,
    skillKey,
  });

  const requiresUpdate =
    pinna.agentMode !== "server-run-loop" ||
    JSON.stringify(pinna.agentConfig ?? null) !== JSON.stringify(agentConfig);

  if (!requiresUpdate) {
    return agentConfig;
  }

  await tx.pinna.update({
    where: { id: pinna.id },
    data: {
      agentMode: "server-run-loop",
      agentConfig: agentConfig as Prisma.InputJsonValue,
    },
  });

  return agentConfig;
}
