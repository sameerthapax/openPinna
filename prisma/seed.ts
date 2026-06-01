import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const pinnaTemplates: Array<{
  key: string;
  name: string;
  defaultTitle: string;
  description: string;
  sortOrder: number;
  systemPrompt: string;
}> = [
  {
    key: "claim",
    name: "Claim Pinna",
    defaultTitle: "What exactly is being claimed?",
    description: "Clarifies the exact claim being made by the note.",
    sortOrder: 1,
    systemPrompt:
      "You are the Claim Pinna. Your job is to extract the precise claim from the current note. Remove ambiguity, identify the core assertion, and rewrite it in clear research language. You must only use the current note, linked source/capture, this thread summary, and this thread messages. Do not use session or project knowledge.",
  },
  {
    key: "evidence",
    name: "Evidence Pinna",
    defaultTitle: "Why should I believe this?",
    description: "Evaluates evidence, methodology, source strength, and assumptions.",
    sortOrder: 2,
    systemPrompt:
      "You are the Evidence Pinna. Your job is to evaluate why the note should be believed. Inspect methodology, evidence quality, sample size, source reliability, assumptions, and missing support. You must only use the current note, linked source/capture, this thread summary, and this thread messages. Do not use session or project knowledge.",
  },
  {
    key: "critique",
    name: "Critique Pinna",
    defaultTitle: "Why might this be wrong?",
    description: "Challenges the note and surfaces weaknesses, bias, and alternative explanations.",
    sortOrder: 3,
    systemPrompt:
      "You are the Critique Pinna. Your job is to challenge the note. Find weak assumptions, edge cases, possible bias, misleading interpretations, contradictions, and alternative explanations. Be rigorous but constructive. You must only use the current note, linked source/capture, this thread summary, and this thread messages. Do not use session or project knowledge.",
  },
  {
    key: "implication",
    name: "Implication Pinna",
    defaultTitle: "If true, what follows?",
    description: "Explores consequences and second-order effects.",
    sortOrder: 4,
    systemPrompt:
      "You are the Implication Pinna. Your job is to explore what follows if the note is true. Identify consequences, second-order effects, research directions, risks, and opportunities. You must only use the current note, linked source/capture, this thread summary, and this thread messages. Do not use session or project knowledge.",
  },
  {
    key: "application",
    name: "Application Pinna",
    defaultTitle: "What can I do with this?",
    description: "Converts the note into practical experiments, builds, tests, or next actions.",
    sortOrder: 5,
    systemPrompt:
      "You are the Application Pinna. Your job is to turn the note into action. Suggest experiments, prototypes, implementation ideas, research tests, combinations with other ideas, and practical next steps. You must only use the current note, linked source/capture, this thread summary, and this thread messages. Do not use session or project knowledge.",
  },
  {
    key: "web_agent",
    name: "Web Agent Pinna",
    defaultTitle: "What can I verify or discover online?",
    description: "Uses web/search tools to verify, expand, and discover external context for a note.",
    sortOrder: 6,
    systemPrompt:
      "You are the Web Agent Pinna. Your job is to help verify and expand the current note using approved web/search tools only when needed. Focus on finding source metadata, related papers, external validation, contradictions, and missing context. You must preserve note-level isolation: use only the current note, linked source/capture, this thread summary, this thread messages, and results from tools explicitly allowed for this Pinna. Do not use session or project knowledge.",
  },
];

const tools: Array<{
  key: string;
  name: string;
  description: string;
  scope: "note" | "session" | "project" | "global";
  schema: Prisma.JsonObject;
  handlerName: string;
}> = [
  {
    key: "extract_claims",
    name: "Extract Claims",
    description: "Extracts precise claims from the current note.",
    scope: "note",
    schema: {
      type: "object",
      properties: { noteText: { type: "string" } },
      required: ["noteText"],
    },
    handlerName: "extractClaims",
  },
  {
    key: "rewrite_claim_precisely",
    name: "Rewrite Claim Precisely",
    description: "Rewrites a claim into precise research language.",
    scope: "note",
    schema: {
      type: "object",
      properties: { claim: { type: "string" } },
      required: ["claim"],
    },
    handlerName: "rewriteClaimPrecisely",
  },
  {
    key: "evaluate_evidence_strength",
    name: "Evaluate Evidence Strength",
    description: "Evaluates evidence strength for the current note.",
    scope: "note",
    schema: {
      type: "object",
      properties: { noteText: { type: "string" }, sourceText: { type: "string" } },
      required: ["noteText"],
    },
    handlerName: "evaluateEvidenceStrength",
  },
  {
    key: "find_assumptions",
    name: "Find Assumptions",
    description: "Finds assumptions behind the current note.",
    scope: "note",
    schema: {
      type: "object",
      properties: { noteText: { type: "string" } },
      required: ["noteText"],
    },
    handlerName: "findAssumptions",
  },
  {
    key: "generate_counterarguments",
    name: "Generate Counterarguments",
    description: "Generates rigorous counterarguments against the note.",
    scope: "note",
    schema: {
      type: "object",
      properties: { noteText: { type: "string" } },
      required: ["noteText"],
    },
    handlerName: "generateCounterarguments",
  },
  {
    key: "explore_implications",
    name: "Explore Implications",
    description: "Explores consequences and second-order effects.",
    scope: "note",
    schema: {
      type: "object",
      properties: { noteText: { type: "string" } },
      required: ["noteText"],
    },
    handlerName: "exploreImplications",
  },
  {
    key: "suggest_applications",
    name: "Suggest Applications",
    description: "Suggests practical applications, experiments, or builds.",
    scope: "note",
    schema: {
      type: "object",
      properties: { noteText: { type: "string" } },
      required: ["noteText"],
    },
    handlerName: "suggestApplications",
  },
  {
    key: "web_search",
    name: "Web Search",
    description: "Searches the web for external context related to the current note.",
    scope: "note",
    schema: {
      type: "object",
      properties: { query: { type: "string" }, reason: { type: "string" } },
      required: ["query"],
    },
    handlerName: "webSearch",
  },
  {
    key: "find_related_papers",
    name: "Find Related Papers",
    description: "Finds related academic papers or sources based on the current note.",
    scope: "note",
    schema: {
      type: "object",
      properties: { query: { type: "string" }, topic: { type: "string" } },
      required: ["query"],
    },
    handlerName: "findRelatedPapers",
  },
  {
    key: "create_followup_note",
    name: "Create Followup Note",
    description: "Creates a follow-up note from a Pinna conversation.",
    scope: "note",
    schema: {
      type: "object",
      properties: { noteText: { type: "string" }, reason: { type: "string" } },
      required: ["noteText"],
    },
    handlerName: "createFollowupNote",
  },
];

const permissionMap: Record<string, string[]> = {
  claim: ["extract_claims", "rewrite_claim_precisely"],
  evidence: ["evaluate_evidence_strength", "find_related_papers"],
  critique: ["find_assumptions", "generate_counterarguments", "find_related_papers"],
  implication: ["explore_implications", "find_related_papers"],
  application: ["suggest_applications", "create_followup_note"],
  web_agent: ["web_search", "find_related_papers", "create_followup_note"],
};

async function main() {
  for (const template of pinnaTemplates) {
    await prisma.pinnaTemplate.upsert({
      where: { key: template.key },
      update: {
        name: template.name,
        description: template.description,
        defaultTitle: template.defaultTitle,
        systemPrompt: template.systemPrompt,
        sortOrder: template.sortOrder,
        isActive: true,
      },
      create: {
        key: template.key,
        name: template.name,
        description: template.description,
        defaultTitle: template.defaultTitle,
        systemPrompt: template.systemPrompt,
        sortOrder: template.sortOrder,
        isActive: true,
      },
    });
  }

  for (const tool of tools) {
    await prisma.tool.upsert({
      where: { key: tool.key },
      update: {
        name: tool.name,
        description: tool.description,
        scope: tool.scope,
        schema: tool.schema,
        handlerName: tool.handlerName,
        isActive: true,
      },
      create: {
        key: tool.key,
        name: tool.name,
        description: tool.description,
        scope: tool.scope,
        schema: tool.schema,
        handlerName: tool.handlerName,
        isActive: true,
      },
    });
  }

  for (const [agentKey, toolKeys] of Object.entries(permissionMap)) {
    for (const toolKey of toolKeys) {
      const tool = await prisma.tool.findUnique({ where: { key: toolKey } });
      if (!tool) continue;

      await prisma.agentToolPermission.upsert({
        where: {
          agentType_agentKey_toolId: {
            agentType: "pinna",
            agentKey,
            toolId: tool.id,
          },
        },
        update: { isEnabled: true },
        create: {
          agentType: "pinna",
          agentKey,
          toolId: tool.id,
          isEnabled: true,
        },
      });
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
