import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  AgentScope,
  PinnaSkillDefinition,
  PinnaSkillManifest,
  SkillPromptInput,
  ToolDescriptor,
} from "@/src/agents/core/agent-types";

const skillManifestSchema = z.object({
  key: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  scope: z.enum(["PROJECT", "SESSION", "NOTE"]),
  version: z.string().trim().min(1),
  defaultModel: z.string().trim().min(1),
  requiresShell: z.boolean().default(false),
  allowedTools: z.array(z.string().trim().min(1)).default([]),
  outputFormat: z.literal("json_object"),
});

const skillCache = new Map<string, Promise<PinnaSkillDefinition>>();

function getSkillsRoot() {
  return path.resolve(process.cwd(), "src", "agents", "skills");
}

function toScopedContextLabel(scope: AgentScope) {
  if (scope === "PROJECT") return "Project context";
  if (scope === "SESSION") return "Session context";
  return "Note context";
}

async function readRequiredFile(filePath: string, label: string, skillKey: string) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown file read error.";
    throw new Error(`Failed to load ${label} for skill '${skillKey}': ${message}`);
  }
}

function normalizeSkillKey(skillKey: string) {
  return skillKey.trim().toLowerCase();
}

function buildPromptSections(sections: Array<string | null | undefined>) {
  return sections.filter((section): section is string => Boolean(section && section.trim())).join("\n\n");
}

export function buildAllowedToolsSummary(allowedTools: ToolDescriptor[]) {
  if (allowedTools.length === 0) {
    return "Allowed tools: none";
  }

  return `Allowed tools: ${allowedTools.map((tool) => tool.key).join(", ")}`;
}

export function buildSkillRuntimeInstructions(
    skill: PinnaSkillDefinition,
    input: {
      scope: string;
      customInstructions?: string | null;
      memorySummary?: string | null;
      projectSummary?: string | null;
      sessionSummary?: string | null;
      sourceTitle?: string | null;
      selectedText?: string | null;
      currentClaim?: string | null;
      threadSummary?: string | null;
      allowedToolsSummary?: string | null;
      recentMessages?: Array<{ role: string; content: string }>;
      baseKnowledgeVersion?: {
        version: number;
        title?: string | null;
        summary?: string | null;
        keyFindings?: string | null;
        userView?: string | null;
        conclusion?: string | null;
      } | null;
    },
) {
  const sections: string[] = [];

  sections.push(
      `You are the "${skill.displayName}" pinna agent.`,
  );

  sections.push(
      `Skill Key: ${skill.key}`,
  );

  sections.push(
      `Scope: ${skill.scope}`,
  );

  if (skill.runtimePrompt?.trim()) {
    sections.push(skill.runtimePrompt.trim());
  }

  if (input.customInstructions?.trim()) {
    sections.push(
        `Custom Instructions:\n${input.customInstructions.trim()}`,
    );
  }

  if (input.currentClaim?.trim()) {
    sections.push(
        `Current Claim:\n${input.currentClaim.trim()}`,
    );
  }

  if (input.baseKnowledgeVersion) {
    const base = input.baseKnowledgeVersion;

    sections.push(
        [
          "Base Knowledge Version",
          `Version: ${base.version}`,
          `Title: ${base.title || "Untitled"}`,
          `Summary: ${base.summary || "None"}`,
          `Key Findings: ${base.keyFindings || "None"}`,
          `User View: ${base.userView || "None"}`,
          `Conclusion: ${base.conclusion || "None"}`,
        ].join("\n"),
    );
  }

  if (input.memorySummary?.trim()) {
    sections.push(
        `Memory Summary:\n${input.memorySummary.trim()}`,
    );
  }

  if (input.projectSummary?.trim()) {
    sections.push(
        `Project Summary:\n${input.projectSummary.trim()}`,
    );
  }

  if (input.sessionSummary?.trim()) {
    sections.push(
        `Session Summary:\n${input.sessionSummary.trim()}`,
    );
  }

  if (input.threadSummary?.trim()) {
    sections.push(
        `Thread Summary:\n${input.threadSummary.trim()}`,
    );
  }

  if (input.sourceTitle?.trim()) {
    sections.push(
        `Source Title:\n${input.sourceTitle.trim()}`,
    );
  }

  if (input.selectedText?.trim()) {
    sections.push(
        `Selected Text:\n${input.selectedText.trim()}`,
    );
  }

  if (input.allowedToolsSummary?.trim()) {
    sections.push(
        `Allowed Tools:\n${input.allowedToolsSummary.trim()}`,
    );
  }

  return sections.join("\n\n---\n\n");
}

export async function loadSkillDefinition(skillKey: string): Promise<PinnaSkillDefinition> {
  const normalizedKey = normalizeSkillKey(skillKey);
  if (!normalizedKey) {
    throw new Error("Skill key is required.");
  }

  const cached = skillCache.get(normalizedKey);
  if (cached) {
    return cached;
  }

  const loader = (async () => {
    const rootDir = path.join(getSkillsRoot(), normalizedKey);
    const manifestPath = path.join(rootDir, "manifest.json");
    const runtimePath = path.join(rootDir, "runtime.md");
    const skillDocPath = path.join(rootDir, "SKILL.md");
    const manifestRaw = await readRequiredFile(manifestPath, "manifest.json", normalizedKey);
    let manifestJson: unknown;
    try {
      manifestJson = JSON.parse(manifestRaw);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid JSON.";
      throw new Error(`Invalid manifest for skill '${normalizedKey}': ${message}`);
    }

    const parsedManifest = skillManifestSchema.safeParse(manifestJson);

    if (!parsedManifest.success) {
      throw new Error(
        `Invalid manifest for skill '${normalizedKey}': ${parsedManifest.error.issues
          .map((issue) => `${issue.path.join(".") || "root"} ${issue.message}`)
          .join("; ")}`,
      );
    }

    const runtimePrompt = (await readRequiredFile(runtimePath, "runtime.md", normalizedKey)).trim();
    if (!runtimePrompt) {
      throw new Error(`runtime.md for skill '${normalizedKey}' must not be empty.`);
    }
    const manifest: PinnaSkillManifest = parsedManifest.data;

    return {
      key: manifest.key,
      displayName: manifest.displayName,
      scope: manifest.scope,
      version: manifest.version,
      defaultModel: manifest.defaultModel,
      requiresShell: manifest.requiresShell,
      allowedTools: manifest.allowedTools,
      runtimePrompt,
      manifest,
      manifestPath,
      runtimePath,
      skillDocPath,
    };
  })();

  skillCache.set(normalizedKey, loader);
  return loader;
}

export async function loadSkillDocument(skillKey: string) {
  const skill = await loadSkillDefinition(skillKey);
  return readRequiredFile(skill.skillDocPath, "SKILL.md", skill.key);
}

export async function listSkillDefinitions() {
  const entries = await readdir(getSkillsRoot(), { withFileTypes: true });
  const skillDirs = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();

  return Promise.all(skillDirs.map((skillKey) => loadSkillDefinition(skillKey)));
}
