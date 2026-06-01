import { db } from "@/lib/db";
import { z } from "zod";

export type AgentType = "pinna" | "session" | "project";
export type ToolScope = "note" | "session" | "project" | "global";

type ToolContext = {
  threadId?: string;
  noteId?: string;
  noteText?: string;
  sourceText?: string;
};

type ExecuteToolInput = {
  toolKey: string;
  input: Record<string, unknown>;
  context: ToolContext;
};

function textSnippet(value: unknown, max = 600) {
  if (typeof value !== "string") return "";
  return value.slice(0, max);
}

async function extractClaims(input: Record<string, unknown>) {
  const noteText = textSnippet(input.noteText);
  const parts = noteText
    .split(/[\n\.\?!]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);

  return {
    claims: parts.length ? parts : [noteText || "No note text provided."],
    provider: "placeholder",
    todo: "Integrate real LLM extraction for richer claim detection.",
  };
}

async function rewriteClaimPrecisely(input: Record<string, unknown>) {
  const claim = textSnippet(input.claim);
  return {
    rewrittenClaim: claim ? `Precise research claim: ${claim}` : "Precise research claim unavailable.",
    provider: "placeholder",
  };
}

async function evaluateEvidenceStrength(input: Record<string, unknown>) {
  const noteText = textSnippet(input.noteText);
  const sourceText = textSnippet(input.sourceText);
  return {
    evaluation:
      "Placeholder evidence assessment: verify sample size, methodology transparency, and reproducibility.",
    noteExcerpt: noteText,
    sourceExcerpt: sourceText,
    provider: "placeholder",
  };
}

async function findAssumptions(input: Record<string, unknown>) {
  const noteText = textSnippet(input.noteText);
  return {
    assumptions: [
      "The observed effect generalizes beyond the original context.",
      "Measurement quality is sufficient for the claim.",
      noteText ? "Interpretation of the note text is semantically stable." : "No note text supplied.",
    ],
    provider: "placeholder",
  };
}

async function generateCounterarguments(input: Record<string, unknown>) {
  const noteText = textSnippet(input.noteText);
  return {
    counterarguments: [
      "Alternative causal variables might explain the same outcome.",
      "Evidence may be correlational rather than causal.",
      noteText ? `The note may overstate certainty: ${noteText.slice(0, 140)}` : "Missing note text reduces confidence.",
    ],
    provider: "placeholder",
  };
}

async function exploreImplications(input: Record<string, unknown>) {
  const noteText = textSnippet(input.noteText);
  return {
    implications: [
      "Define one experiment to falsify the core claim.",
      "Track second-order risk if claim scales to production.",
      noteText ? `Potential near-term application from note: ${noteText.slice(0, 120)}` : "Need note text for specific implications.",
    ],
    provider: "placeholder",
  };
}

async function suggestApplications(input: Record<string, unknown>) {
  const noteText = textSnippet(input.noteText);
  return {
    applications: [
      "Create a minimal prototype validating one measurable outcome.",
      "Design A/B test around the primary claim variable.",
      noteText ? `Draft follow-up action from note snippet: ${noteText.slice(0, 120)}` : "Need note text for tailored applications.",
    ],
    provider: "placeholder",
  };
}

async function webSearch(input: Record<string, unknown>) {
  return {
    query: textSnippet(input.query, 240),
    reason: textSnippet(input.reason, 240),
    status: "unavailable",
    message: "Web search provider is not configured yet.",
    todo: "Wire a web provider behind this handler.",
  };
}

async function findRelatedPapers(input: Record<string, unknown>) {
  return {
    query: textSnippet(input.query, 240),
    topic: textSnippet(input.topic, 240),
    status: "unavailable",
    message: "Related-paper search provider is not configured yet.",
    todo: "Wire academic search API behind this handler.",
  };
}

async function createFollowupNote(input: Record<string, unknown>, context: ToolContext) {
  const noteText = textSnippet(input.noteText);

  if (!context.noteId) {
    return {
      status: "skipped",
      message: "No note context found. Could not create follow-up note.",
    };
  }

  const sourceNote = await db.note.findUnique({ where: { id: context.noteId } });
  if (!sourceNote) {
    return {
      status: "skipped",
      message: "Source note does not exist.",
    };
  }

  const followup = await db.note.create({
    data: {
      projectId: sourceNote.projectId,
      sessionId: sourceNote.sessionId,
      sourceId: sourceNote.sourceId,
      captureId: sourceNote.captureId,
      noteText,
      userCommentary: textSnippet(input.reason, 240) || "Created by pinna tool call.",
    },
  });

  return {
    status: "created",
    followupNoteId: followup.id,
  };
}

export const toolHandlers = {
  extractClaims,
  rewriteClaimPrecisely,
  evaluateEvidenceStrength,
  findAssumptions,
  generateCounterarguments,
  exploreImplications,
  suggestApplications,
  webSearch,
  findRelatedPapers,
  createFollowupNote,
} as const;

type ToolHandlerName = keyof typeof toolHandlers;

type ValidateToolAllowedInput = {
  agentType: AgentType;
  agentKey: string;
  toolKey: string;
  requiredScope: ToolScope;
};

const scopeRank: Record<ToolScope, number> = {
  note: 1,
  session: 2,
  project: 3,
  global: 4,
};

function isScopeAllowed(agentType: AgentType, toolScope: ToolScope) {
  if (agentType === "pinna") return toolScope === "note" || toolScope === "global";
  if (agentType === "session") return toolScope === "session" || toolScope === "global";
  return toolScope === "project" || toolScope === "global";
}

function buildSchemaValidator(schema: unknown) {
  const parsed = z
    .object({
      type: z.literal("object"),
      properties: z.record(z.object({ type: z.string().optional() })).optional(),
      required: z.array(z.string()).optional(),
    })
    .safeParse(schema);

  if (!parsed.success) {
    return (input: Record<string, unknown>) => ({ ok: true as const, data: input });
  }

  const required = parsed.data.required ?? [];
  const properties = parsed.data.properties ?? {};

  return (input: Record<string, unknown>) => {
    for (const key of required) {
      if (!(key in input)) {
        return { ok: false as const, error: `Missing required field: ${key}` };
      }
    }

    for (const [key, config] of Object.entries(properties)) {
      if (!(key in input) || input[key] == null) continue;
      if (config.type === "string" && typeof input[key] !== "string") {
        return { ok: false as const, error: `Field '${key}' must be a string.` };
      }
    }

    return { ok: true as const, data: input };
  };
}

export async function listTools() {
  return db.tool.findMany({ where: { isActive: true }, orderBy: { key: "asc" } });
}

export async function getAllowedToolsForAgent(agentType: AgentType, agentKey: string) {
  const permissions = await db.agentToolPermission.findMany({
    where: {
      agentType,
      agentKey,
      isEnabled: true,
      tool: { isActive: true },
    },
    include: { tool: true },
  });

  return permissions.map((item) => item.tool);
}

export async function validateToolAllowed(input: ValidateToolAllowedInput) {
  const permission = await db.agentToolPermission.findFirst({
    where: {
      agentType: input.agentType,
      agentKey: input.agentKey,
      isEnabled: true,
      tool: {
        key: input.toolKey,
        isActive: true,
      },
    },
    include: { tool: true },
  });

  if (!permission) {
    console.warn("Denied tool call: permission missing", input);
    throw new Error("Tool is not allowed for this agent.");
  }

  const toolScope = permission.tool.scope as ToolScope;
  if (!isScopeAllowed(input.agentType, toolScope)) {
    console.warn("Denied tool call: scope violation", {
      ...input,
      toolScope,
    });
    throw new Error("Tool scope is not allowed for this agent.");
  }

  if (scopeRank[toolScope] < scopeRank[input.requiredScope]) {
    console.warn("Denied tool call: required scope mismatch", {
      ...input,
      toolScope,
    });
    throw new Error("Tool scope does not satisfy required scope.");
  }

  return permission.tool;
}

export async function executeTool({ toolKey, input, context }: ExecuteToolInput) {
  const tool = await db.tool.findFirst({ where: { key: toolKey, isActive: true } });
  if (!tool) {
    return {
      ok: false,
      error: "Tool metadata not found or inactive.",
    };
  }

  const validator = buildSchemaValidator(tool.schema);
  const validation = validator(input);
  if (!validation.ok) {
    return {
      ok: false,
      error: validation.error,
    };
  }

  const handlerName = tool.handlerName as ToolHandlerName;
  const handler = toolHandlers[handlerName];
  if (!handler) {
    return {
      ok: false,
      error: `Tool handler '${tool.handlerName}' is not implemented in backend code.`,
    };
  }

  try {
    const output = await handler(validation.data, context);
    return {
      ok: true,
      output,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Tool execution failed.",
    };
  }
}
