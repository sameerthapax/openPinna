import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { loadSkillDefinition } from "@/src/agents/skills/skill-loader";

const execFileAsync = promisify(execFile);

async function buildSkillZipBuffer(rootDir: string) {
  const parentDir = path.dirname(rootDir);
  const topLevelDir = path.basename(rootDir);
  const zipName = `${topLevelDir}.zip`;
  const zipPath = path.join(parentDir, zipName);

  await execFileAsync("zip", ["-r", "-q", zipPath, topLevelDir], {
    cwd: parentDir,
  });

  const zipBuffer = await readFile(zipPath);
  return zipBuffer.toString("base64");
}

export async function buildInlineOpenAISkill(skillKey: string) {
  const skill = await loadSkillDefinition(skillKey);
  const rootDir = path.dirname(skill.manifestPath);
  const data = await buildSkillZipBuffer(rootDir);

  return {
    type: "inline" as const,
    name: skill.displayName,
    description: `${skill.displayName} runtime bundle`,
    source: {
      type: "base64" as const,
      media_type: "application/zip" as const,
      data,
    },
  };
}
