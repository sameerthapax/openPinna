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
  input: SkillPromptInput,
) {
  const recentMessages = (input.recentMessages ?? [])
    .slice(-5)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");

  return buildPromptSections([
    'Return json only. Use exactly this json object shape: {"internal":"hidden self-guidance or self-check","reply":"final user-facing reply"}.',
    skill.runtimePrompt,
    `${toScopedContextLabel(input.scope)}:`,
    input.projectSummary ? `Project summary:\n${input.projectSummary}` : null,
    input.sessionSummary ? `Session summary:\n${input.sessionSummary}` : null,
    input.noteText ? `Note text:\n${input.noteText}` : null,
    input.sourceTitle ? `Source title: ${input.sourceTitle}` : null,
    input.selectedText ? `Selected text:\n${input.selectedText}` : null,
    input.threadSummary ? `Thread summary:\n${input.threadSummary}` : null,
    input.memorySummary ? `Memory summary:\n${input.memorySummary}` : null,
    input.customInstructions ? `Thread instructions:\n${input.customInstructions}` : null,
    input.allowedToolsSummary ?? "Allowed tools: none",
    recentMessages ? `Recent messages:\n${recentMessages}` : null,
    "Tool and safety rules: use only the approved tools, never assume shell access unless the runtime exposes it, and prefer zero tool calls when the answer is already in the provided context.",
  ]);
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
