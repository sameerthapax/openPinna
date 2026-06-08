import type { AgentScope } from "@/src/agents/core/agent-types";

export type AgentToolCatalogEntry = {
  key: string;
  displayName: string;
  description: string;
  scope: AgentScope;
  requiresShell: boolean;
  handlerName: string;
  schemaJson: Record<string, unknown>;
};

export type PinnaTemplateCatalogEntry = {
  key: string;
  displayName: string;
  defaultTitle: string;
  description: string;
  systemPrompt: string;
  scope: AgentScope;
  defaultSkillKey: string;
  allowShell: boolean;
  sortOrder: number;
  isActive?: boolean;
};

export const agentToolCatalog: AgentToolCatalogEntry[] = [
  {
    key: "extract_claims",
    displayName: "Extract Claims",
    description: "Extract precise claims from the current note.",
    scope: "NOTE",
    requiresShell: false,
    handlerName: "extractClaims",
    schemaJson: {
      type: "object",
      properties: { selectedText: { type: "string" } },
      required: ["selectedText"],
    },
  },
  {
    key: "rewrite_claim_precisely",
    displayName: "Rewrite Claim Precisely",
    description: "Rewrite a claim into precise research language.",
    scope: "NOTE",
    requiresShell: false,
    handlerName: "rewriteClaimPrecisely",
    schemaJson: {
      type: "object",
      properties: { claim: { type: "string" } },
      required: ["claim"],
    },
  },
  {
    key: "evaluate_evidence_strength",
    displayName: "Evaluate Evidence Strength",
    description: "Review evidence quality and methodological support for the current note.",
    scope: "NOTE",
    requiresShell: false,
    handlerName: "evaluateEvidenceStrength",
    schemaJson: {
      type: "object",
      properties: { selectedText: { type: "string" }, sourceText: { type: "string" } },
      required: ["selectedText"],
    },
  },
  {
    key: "find_assumptions",
    displayName: "Find Assumptions",
    description: "Identify hidden assumptions in the current note.",
    scope: "NOTE",
    requiresShell: false,
    handlerName: "findAssumptions",
    schemaJson: {
      type: "object",
      properties: { selectedText: { type: "string" } },
      required: ["selectedText"],
    },
  },
  {
    key: "generate_counterarguments",
    displayName: "Generate Counterarguments",
    description: "Generate rigorous counterarguments against the note.",
    scope: "NOTE",
    requiresShell: false,
    handlerName: "generateCounterarguments",
    schemaJson: {
      type: "object",
      properties: { selectedText: { type: "string" } },
      required: ["selectedText"],
    },
  },
  {
    key: "get_pinna_base_knowledge",
    displayName: "Get Pinna Base Knowledge",
    description: "Retrieve the selected base knowledge version for the current pinna thread.",
    scope: "NOTE",
    requiresShell: false,
    handlerName: "getPinnaBaseKnowledge",
    schemaJson: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    key: "openai_web_search",
    displayName: "OpenAI Web Search",
    description: "Search the web for note or project support without using shell.",
    scope: "NOTE",
    requiresShell: false,
    handlerName: "openaiWebSearch",
    schemaJson: {
      type: "object",
      properties: {
        query: { type: "string" },
        noteId: { type: "string" },
        threadId: { type: "string" },
        maxResults: { type: "number" },
      },
      required: ["query"],
    },
  },
  {
    key: "summarize_web_findings",
    displayName: "Summarize Web Findings",
    description: "Summarize structured web findings for an agent reply.",
    scope: "NOTE",
    requiresShell: false,
    handlerName: "summarizeWebFindings",
    schemaJson: {
      type: "object",
      properties: {
        findings: { type: "array" }
      },
      required: ["findings"],
    },
  },
  {
    key: "link_web_finding_to_note",
    displayName: "Link Web Finding To Note",
    description: "Persist a structured external finding as note-linked knowledge.",
    scope: "NOTE",
    requiresShell: false,
    handlerName: "linkWebFindingToNote",
    schemaJson: {
      type: "object",
      properties: {
        title: { type: "string" },
        url: { type: "string" },
        snippet: { type: "string" },
        sourceName: { type: "string" },
        publishedDate: { type: "string" }
      },
      required: ["title", "url"],
    },
  },
  {
    key: "get_available_skills",
    displayName: "Get Available Skills",
    description: "List available skills, optionally filtered by scope.",
    scope: "SESSION",
    requiresShell: false,
    handlerName: "getAvailableSkills",
    schemaJson: {
      type: "object",
      properties: { scope: { type: "string" } },
      required: [],
    },
  },
  {
    key: "build_research_synthesis",
    displayName: "Build Research Synthesis",
    description: "Build a synthesis from gathered research context.",
    scope: "PROJECT",
    requiresShell: false,
    handlerName: "buildResearchSynthesis",
    schemaJson: {
      type: "object",
      properties: {
        sourceText: { type: "string" },
        summary: { type: "string" },
        query: { type: "string" }
      },
      required: [],
    },
  },
  {
    key: "write_project_knowledge",
    displayName: "Write Project Knowledge",
    description: "Persist project-level knowledge output.",
    scope: "PROJECT",
    requiresShell: false,
    handlerName: "writeProjectKnowledge",
    schemaJson: {
      type: "object",
      properties: { content: { type: "string" } },
      required: ["content"],
    },
  },
  {
    key: "download_source",
    displayName: "Download Source",
    description: "Download a project research source when allowed.",
    scope: "PROJECT",
    requiresShell: true,
    handlerName: "downloadSource",
    schemaJson: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
  },
  {
    key: "extract_pdf_text",
    displayName: "Extract PDF Text",
    description: "Extract text from a downloaded PDF source.",
    scope: "PROJECT",
    requiresShell: true,
    handlerName: "extractPdfText",
    schemaJson: {
      type: "object",
      properties: { filePath: { type: "string" } },
      required: ["filePath"],
    },
  },
  {
    key: "explore_implications",
    displayName: "Explore Implications",
    description: "Explore consequences and second-order effects.",
    scope: "NOTE",
    requiresShell: false,
    handlerName: "generateCounterarguments",
    schemaJson: {
      type: "object",
      properties: { selectedText: { type: "string" } },
      required: ["selectedText"],
    },
  },
  {
    key: "suggest_applications",
    displayName: "Suggest Applications",
    description: "Suggest practical applications or follow-up actions.",
    scope: "NOTE",
    requiresShell: false,
    handlerName: "extractClaims",
    schemaJson: {
      type: "object",
      properties: { selectedText: { type: "string" } },
      required: ["selectedText"],
    },
  }
];

export const pinnaTemplateCatalog: PinnaTemplateCatalogEntry[] = [
  {
    key: "claim",
    displayName: "Claim Pinna",
    defaultTitle: "What exactly is being claimed?",
    description: "Extract the precise claim from the current note.",
    systemPrompt: "Legacy compatibility template for Claim Pinna.",
    scope: "NOTE",
    defaultSkillKey: "claim",
    allowShell: false,
    sortOrder: 1,
  },
  {
    key: "evidence",
    displayName: "Evidence Pinna",
    defaultTitle: "Why should I believe this?",
    description: "Evaluate evidence strength for the note.",
    systemPrompt: "Legacy compatibility template for Evidence Pinna.",
    scope: "NOTE",
    defaultSkillKey: "evidence",
    allowShell: false,
    sortOrder: 2,
  },
  {
    key: "counterargument",
    displayName: "Counterargument Pinna",
    defaultTitle: "Why might this be wrong?",
    description: "Challenge the note with alternatives and failure cases.",
    systemPrompt: "Legacy compatibility template for Counterargument Pinna.",
    scope: "NOTE",
    defaultSkillKey: "counterargument",
    allowShell: false,
    sortOrder: 3,
  },
  {
    key: "methodology",
    displayName: "Methodology Pinna",
    defaultTitle: "How strong is the method?",
    description: "Inspect the methodology behind the note.",
    systemPrompt: "Legacy compatibility template for Methodology Pinna.",
    scope: "NOTE",
    defaultSkillKey: "methodology",
    allowShell: false,
    sortOrder: 4,
  },
  {
    key: "summary",
    displayName: "Summary Pinna",
    defaultTitle: "Summarize this note",
    description: "Summarize the current note faithfully.",
    systemPrompt: "Legacy compatibility template for Summary Pinna.",
    scope: "NOTE",
    defaultSkillKey: "summary",
    allowShell: false,
    sortOrder: 5,
  },
  {
    key: "note-web-research",
    displayName: "Note Web Research Pinna",
    defaultTitle: "What external support exists?",
    description: "Use web search to verify and expand a note without shell access.",
    systemPrompt: "Legacy compatibility template for Note Web Research Pinna.",
    scope: "NOTE",
    defaultSkillKey: "note-web-research",
    allowShell: false,
    sortOrder: 6,
  },
  {
    key: "session-synthesizer",
    displayName: "Session Synthesizer",
    defaultTitle: "Synthesize this session",
    description: "Synthesize note activity across a session.",
    systemPrompt: "Session-level synthesis template.",
    scope: "SESSION",
    defaultSkillKey: "session-synthesizer",
    allowShell: false,
    sortOrder: 7,
  },
  {
    key: "report-writer",
    displayName: "Report Writer",
    defaultTitle: "Draft a report",
    description: "Write a structured project report.",
    systemPrompt: "Project-level report writer template.",
    scope: "PROJECT",
    defaultSkillKey: "report-writer",
    allowShell: false,
    sortOrder: 8,
  },
  {
    key: "project-web-agent",
    displayName: "Project Web Agent",
    defaultTitle: "Investigate across the web",
    description: "Research project questions with web tools and optional shell access.",
    systemPrompt: "Project-level web agent template.",
    scope: "PROJECT",
    defaultSkillKey: "project-web-agent",
    allowShell: false,
    sortOrder: 9,
  },
  {
    key: "deep-research",
    displayName: "Deep Research Agent",
    defaultTitle: "Run deep research",
    description: "Perform project-level deep research with policy-gated shell access.",
    systemPrompt: "Project-level deep research template.",
    scope: "PROJECT",
    defaultSkillKey: "deep-research",
    allowShell: true,
    sortOrder: 10,
  },
  {
    key: "critique",
    displayName: "Critique Pinna",
    defaultTitle: "Why might this be wrong?",
    description: "Legacy alias for Counterargument Pinna.",
    systemPrompt: "Legacy alias for critique threads.",
    scope: "NOTE",
    defaultSkillKey: "counterargument",
    allowShell: false,
    sortOrder: 101,
  },
  {
    key: "web_agent",
    displayName: "Web Agent Pinna",
    defaultTitle: "What can I verify online?",
    description: "Legacy alias for Note Web Research Pinna.",
    systemPrompt: "Legacy alias for web agent threads.",
    scope: "NOTE",
    defaultSkillKey: "note-web-research",
    allowShell: false,
    sortOrder: 102,
  },
  {
    key: "implication",
    displayName: "Implication Pinna",
    defaultTitle: "If true, what follows?",
    description: "Legacy alias retained for older note threads.",
    systemPrompt: "Legacy alias for implication threads.",
    scope: "NOTE",
    defaultSkillKey: "summary",
    allowShell: false,
    sortOrder: 103,
  },
  {
    key: "application",
    displayName: "Application Pinna",
    defaultTitle: "What can I do with this?",
    description: "Legacy alias retained for older note threads.",
    systemPrompt: "Legacy alias for application threads.",
    scope: "NOTE",
    defaultSkillKey: "summary",
    allowShell: false,
    sortOrder: 104,
  },
];
