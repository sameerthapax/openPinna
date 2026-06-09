import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getOpenAIClient } from "@/src/agents/openai/openai-client";
import { listSkillDefinitions } from "@/src/agents/skills/skill-loader";
import {
  rewriteClaimPrecisely as rewriteClaimPreciselyWithOpenAI,
} from "@/app/api/_lib/services/claim.service";
import { z } from "zod";

export type AgentType = "pinna" | "session" | "project";
export type ToolScope = "NOTE" | "SESSION" | "PROJECT";

type ToolContext = {
  threadId?: string;
  projectId?: string;
  sessionId?: string;
  noteId?: string;
  selectedText?: string;
  sourceText?: string;
};

const PINNA_AGENT_DEBUG = process.env.PINNA_AGENT_DEBUG === "1";

type ExecuteToolInput = {
  toolKey: string;
  input: Record<string, unknown>;
  context: ToolContext;
};

type WebFinding = {
  title: string;
  url: string;
  snippet: string;
  sourceName: string;
  publishedDate?: string | null;
  relevanceToNote: string;
};

type WebSearchAnnotation = {
  url?: string;
  title?: string;
  source?: string;
  published_at?: string;
};

type WebSearchPart = {
  annotations?: WebSearchAnnotation[];
  text?: string;
};

type WebSearchMessage = {
  type?: string;
  content?: WebSearchPart[];
};

type WebSearchResponse = {
  output?: WebSearchMessage[];
  output_text?: string;
};

function textSnippet(value: unknown, max = 600) {
  if (typeof value !== "string") return "";
  return value.slice(0, max);
}

function toPlainObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function inferRelevanceToNote(selectedText: string, snippet: string) {
  const note = selectedText.trim();
  const excerpt = snippet.trim();
  if (!note) return "Useful as external support if it matches the note claim.";
  if (!excerpt) return "External result found, but the snippet is thin.";

  return `Compare this finding against the note focus: ${note.slice(0, 160)}`;
}

async function rewriteClaimPrecisely(input: Record<string, unknown>, context: ToolContext) {
  const oldClaim = textSnippet(input.oldClaim);
  const selectedText = textSnippet(input.selectedText);
  const additionalContext = textSnippet(input.additionalContext, 4000);

  const result = await rewriteClaimPreciselyWithOpenAI({
    oldClaim,
    selectedText,
    additionalContext,
  });

  let pinnaId: string | null = null;
  let persisted = false;

  if (context.threadId) {
    try {
      const thread = await db.chatThread.findUnique({
        where: { id: context.threadId },
        select: { pinnaId: true },
      });

      pinnaId = thread?.pinnaId || null;

      if (pinnaId && result.rewrittenClaim.trim()) {
        const pinna = await db.pinna.findUnique({
          where: { id: pinnaId },
          select: { remark: true },
        });
        const existingRemark = toPlainObject(pinna?.remark);
        const now = new Date().toISOString();

        await db.pinna.update({
          where: { id: pinnaId },
          data: {
            remark: {
              ...existingRemark,
              claim: result.rewrittenClaim.trim(),
              lastUpdatedByTool: "rewrite_claim_precisely",
              lastUpdatedAt: now,
            } as Prisma.InputJsonValue,
          },
        });

        persisted = true;

        if (PINNA_AGENT_DEBUG) {
          console.log("[PINNA_TIMING]", {
            step: "rewrite_claim_precisely_persisted",
            threadId: context.threadId,
            pinnaId,
            claimLength: result.rewrittenClaim.trim().length,
            persisted,
          });
        }
      } else if (PINNA_AGENT_DEBUG) {
        console.log("[PINNA_TIMING]", {
          step: "rewrite_claim_precisely_persist_skipped",
          threadId: context.threadId,
          pinnaId,
          claimLength: result.rewrittenClaim.trim().length,
          persisted: false,
        });
      }
    } catch (error) {
      if (PINNA_AGENT_DEBUG) {
        console.log("[PINNA_TIMING]", {
          step: "rewrite_claim_precisely_persist_failed",
          threadId: context.threadId,
          pinnaId,
          claimLength: result.rewrittenClaim.trim().length,
          persisted: false,
          error: error instanceof Error ? error.message : "Unknown persistence error.",
        });
      }
    }
  }

  return {
    rewrittenClaim: result.rewrittenClaim,
    currentClaim: result.rewrittenClaim,
    reasoning: result.reasoning,
    uncertainty: result.uncertainty,
    provider: "openai",
    persisted,
    pinnaId,
  };
}

async function evaluateEvidenceStrength(input: Record<string, unknown>) {
  const selectedText = textSnippet(input.selectedText);
  const sourceText = textSnippet(input.sourceText);
  return {
    evaluation:
      "Evidence review placeholder: verify method transparency, sample quality, effect size, and reproducibility.",
    noteExcerpt: selectedText,
    sourceExcerpt: sourceText,
    provider: "placeholder",
  };
}

async function findAssumptions(input: Record<string, unknown>) {
  const selectedText = textSnippet(input.selectedText);
  return {
    assumptions: [
      "The observed result generalizes beyond the original setting.",
      "Measurement quality is sufficient for the stated claim.",
      selectedText
        ? "The note wording preserves the original source meaning."
        : "No selected text supplied.",
    ],
    provider: "placeholder",
  };
}

async function generateCounterarguments(input: Record<string, unknown>) {
  const selectedText = textSnippet(input.selectedText);
  return {
    counterarguments: [
      "Alternative causal variables might explain the same outcome.",
      "The evidence may be correlational rather than causal.",
      selectedText
        ? `The note may overstate certainty: ${selectedText.slice(0, 140)}`
        : "Missing selected text reduces confidence.",
    ],
    provider: "placeholder",
  };
}

async function getPinnaBaseKnowledge(_input: Record<string, unknown>, context: ToolContext) {
  if (!context.threadId) {
    return {
      status: "skipped",
      message: "No thread context found. Could not retrieve pinna base knowledge.",
    };
  }

  const thread = await db.chatThread.findUnique({
    where: { id: context.threadId },
    include: {
      pinna: {
        include: {
          selectedBaseKnowledgeVersion: true,
        },
      },
    },
  });

  const baseVersion = thread?.pinna?.selectedBaseKnowledgeVersion;
  if (!thread?.pinna || !baseVersion) {
    return {
      status: "missing",
      message: "This pinna does not have a selected base knowledge version yet.",
    };
  }

  return {
    status: "ok",
    pinnaId: thread.pinna.id,
    noteId: thread.noteId,
    baseKnowledge: {
      id: baseVersion.id,
      version: baseVersion.version,
      title: baseVersion.title,
      authors: Array.isArray(baseVersion.authors) ? baseVersion.authors : [],
      publicationDate: baseVersion.publicationDate,
      abstract: baseVersion.abstract,
      summary: baseVersion.summary,
      keyFindings: baseVersion.keyFindings,
      userView: baseVersion.userView,
      conclusion: baseVersion.conclusion,
      model: baseVersion.model,
      sourceSnapshot: baseVersion.sourceSnapshot,
      createdAt: baseVersion.createdAt.toISOString(),
    },
  };
}

function collectResponseFindings(response: unknown, selectedText: string) {
  const findings: WebFinding[] = [];
  const output = (response as WebSearchResponse).output ?? [];

  for (const item of output) {
    if (item?.type !== "message" || !Array.isArray(item.content)) {
      continue;
    }

    for (const part of item.content) {
      const annotations = Array.isArray(part?.annotations) ? part.annotations : [];
      const snippet = typeof part?.text === "string" ? part.text : "";

      for (const annotation of annotations) {
        const url = typeof annotation?.url === "string" ? annotation.url : "";
        if (!url) continue;

        findings.push({
          title:
            typeof annotation?.title === "string" && annotation.title.trim()
              ? annotation.title
              : url,
          url,
          snippet: snippet.slice(0, 320),
          sourceName:
            typeof annotation?.source === "string" && annotation.source.trim()
              ? annotation.source
              : "web",
          publishedDate:
            typeof annotation?.published_at === "string" ? annotation.published_at : null,
          relevanceToNote: inferRelevanceToNote(selectedText, snippet),
        });
      }
    }
  }

  if (findings.length > 0) {
    return findings;
  }

  const fallbackText = (response as WebSearchResponse).output_text ?? "";
  return fallbackText
    ? [
        {
          title: "Web search summary",
          url: "",
          snippet: fallbackText.slice(0, 320),
          sourceName: "web",
          publishedDate: null,
          relevanceToNote: inferRelevanceToNote(selectedText, fallbackText),
        },
      ]
    : [];
}

async function openaiWebSearch(input: Record<string, unknown>, context: ToolContext) {
  const query = textSnippet(input.query, 400);
  const maxResults = Number.isFinite(Number(input.maxResults)) ? Number(input.maxResults) : 5;

  if (!query) {
    return {
      query: "",
      findings: [],
      error: "query is required",
    };
  }

  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: query,
    tools: [{ type: "web_search_preview" as never }],
    tool_choice: "auto",
  });

  return {
    query,
    findings: collectResponseFindings(response, context.selectedText || "").slice(0, maxResults),
  };
}

async function summarizeWebFindings(input: Record<string, unknown>) {
  const findings = Array.isArray(input.findings) ? input.findings : [];
  const summary = findings
    .slice(0, 5)
    .map((finding) => {
      if (!finding || typeof finding !== "object") return null;
      const entry = finding as Record<string, unknown>;
      return {
        title: textSnippet(entry.title, 160),
        url: textSnippet(entry.url, 240),
        takeaway: textSnippet(entry.snippet, 200),
      };
    })
    .filter(Boolean);

  return {
    summary,
    noteBoundary:
      "Treat these as external findings. Do not replace the note's original claim without confirmation.",
  };
}

async function linkWebFindingToNote(input: Record<string, unknown>, context: ToolContext) {
  if (!context.noteId || !context.projectId || !context.sessionId) {
    return {
      status: "skipped",
      message: "Missing note context for linking.",
    };
  }

  const title = textSnippet(input.title, 200);
  const url = textSnippet(input.url, 400);
  const snippet = textSnippet(input.snippet, 600);

  const event = await db.knowledgeEvent.create({
    data: {
      projectId: context.projectId,
      sessionId: context.sessionId,
      noteId: context.noteId,
      threadId: context.threadId || null,
      eventType: "web_finding_linked",
      content: [title, url, snippet].filter(Boolean).join(" | ").slice(0, 2000),
      actor: "assistant",
      payload: {
        title,
        url,
        snippet,
        sourceName: textSnippet(input.sourceName, 200),
        publishedDate: textSnippet(input.publishedDate, 64),
      },
    },
  });

  return {
    status: "linked",
    knowledgeEventId: event.id,
    noteId: context.noteId,
  };
}

async function getAvailableSkills(input: Record<string, unknown>) {
  const scope = textSnippet(input.scope, 32).toUpperCase();
  const skills = await listSkillDefinitions();

  return {
    skills: skills
      .filter((skill) => (scope ? skill.scope === scope : true))
      .map((skill) => ({
        key: skill.key,
        displayName: skill.displayName,
        scope: skill.scope,
        defaultModel: skill.defaultModel,
        requiresShell: skill.requiresShell,
        allowedTools: skill.allowedTools,
      })),
  };
}

async function buildResearchSynthesis(input: Record<string, unknown>) {
  return {
    status: "ok",
    synthesis: textSnippet(input.sourceText || input.summary || input.query, 800),
    provider: "placeholder",
  };
}

async function writeProjectKnowledge(input: Record<string, unknown>) {
  return {
    status: "ok",
    accepted: Boolean(textSnippet(input.content, 10)),
    provider: "placeholder",
  };
}

async function downloadSource(input: Record<string, unknown>) {
  return {
    status: "unavailable",
    url: textSnippet(input.url, 400),
    message: "Source download is not wired yet.",
  };
}

async function extractPdfText(input: Record<string, unknown>) {
  return {
    status: "unavailable",
    filePath: textSnippet(input.filePath, 400),
    message: "PDF extraction is not wired yet.",
  };
}

export const toolHandlers = {
  rewriteClaimPrecisely,
  evaluateEvidenceStrength,
  findAssumptions,
  generateCounterarguments,
  getPinnaBaseKnowledge,
  openaiWebSearch,
  summarizeWebFindings,
  linkWebFindingToNote,
  getAvailableSkills,
  buildResearchSynthesis,
  writeProjectKnowledge,
  downloadSource,
  extractPdfText,
} as const;

type ToolHandlerName = keyof typeof toolHandlers;

type ValidateToolAllowedInput = {
  agentType: AgentType;
  agentKey: string;
  skillKey: string;
  toolKey: string;
  requiredScope: ToolScope;
};

function buildSchemaValidator(schema: unknown) {
  const parsed = z
    .object({
      type: z.literal("object"),
      properties: z
        .record(z.string(), z.object({ type: z.string().optional() }))
        .optional(),
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

    for (const [key, config] of Object.entries(properties) as Array<
      [string, { type?: string }]
    >) {
      if (!(key in input) || input[key] == null) continue;
      if (config.type === "string" && typeof input[key] !== "string") {
        return { ok: false as const, error: `Field '${key}' must be a string.` };
      }
    }

    return { ok: true as const, data: input };
  };
}

export async function listTools() {
  return db.agentTool.findMany({ where: { isEnabled: true }, orderBy: { key: "asc" } });
}

export async function getAllowedToolsForAgent(agentType: AgentType, agentKey: string) {
  if (agentType !== "pinna") {
    return [];
  }

  const template = await db.pinnaTemplate.findFirst({
    where: { key: agentKey, isActive: true },
    include: {
      defaultSkill: {
        include: {
          pinnaSkillTools: {
            include: {
              tool: true,
            },
          },
        },
      },
    },
  });

  if (!template?.defaultSkill || !template.defaultSkill.isEnabled) {
    return [];
  }

  return template.defaultSkill.pinnaSkillTools
    .map((item) => item.tool)
    .filter((tool) => tool.isEnabled)
    .map((tool) => ({
      key: tool.key,
      description: tool.description,
      schema: tool.schemaJson,
      requiresShell: tool.requiresShell,
    }));
}

export async function validateToolAllowed(input: ValidateToolAllowedInput) {
  const template = await db.pinnaTemplate.findFirst({
    where: {
      key: input.agentKey,
      isActive: true,
      defaultSkill: {
        key: input.skillKey,
        isEnabled: true,
      },
    },
    include: {
      defaultSkill: {
        include: {
          pinnaSkillTools: {
            where: {
              tool: {
                key: input.toolKey,
                isEnabled: true,
              },
            },
            include: {
              tool: true,
            },
          },
        },
      },
    },
  });

  const tool = template?.defaultSkill?.pinnaSkillTools[0]?.tool;
  if (!tool) {
    throw new Error("Tool is not allowed for this agent.");
  }

  if (tool.scope && tool.scope !== input.requiredScope) {
    throw new Error("Tool scope does not satisfy required scope.");
  }

  return tool;
}

export async function executeTool({ toolKey, input, context }: ExecuteToolInput) {
  const tool = await db.agentTool.findFirst({ where: { key: toolKey, isEnabled: true } });
  if (!tool) {
    return {
      ok: false,
      error: "Tool metadata not found or inactive.",
    };
  }

  const validator = buildSchemaValidator(tool.schemaJson);
  const validation = validator(input);
  if (!validation.ok) {
    return {
      ok: false,
      error: validation.error,
    };
  }

  const handlerName = tool.handlerName as ToolHandlerName;
  console.log("[TOOL_EXECUTE]", {
    toolKey,
    handlerName: tool.handlerName,
    input,
  });
  const handler = toolHandlers[handlerName];
  if (!handler) {
    return {
      ok: false,
      error: `Tool handler '${tool.handlerName}' is not implemented in backend code.`,
    };
  }

  try {
    console.log("[TOOL_HANDLER_START]", {
      handlerName,
      context,
    });
    const output = await handler(validation.data, context);
    console.log("[TOOL_HANDLER_OUTPUT]", {
      handlerName,
      output,
    });
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
