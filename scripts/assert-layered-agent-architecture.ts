import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { shouldAttachShellTool } from "@/src/agents/openai/responses-agent-runner";
import {
  buildSkillRuntimeInstructions,
  loadSkillDefinition,
} from "@/src/agents/skills/skill-loader";

async function assertMissingRuntimeFails() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "openpinna-skill-test-"));
  const originalCwd = process.cwd();

  try {
    process.chdir(tempRoot);
    await mkdir(path.join("src", "agents", "skills", "missing-runtime"), { recursive: true });
    await writeFile(
      path.join("src", "agents", "skills", "missing-runtime", "manifest.json"),
      JSON.stringify(
        {
          key: "missing-runtime",
          displayName: "Missing Runtime",
          scope: "NOTE",
          version: "1.0.0",
          defaultModel: "gpt-4.1-mini",
          requiresShell: false,
          allowedTools: [],
          outputFormat: "json_object",
        },
        null,
        2,
      ),
      "utf8",
    );

    await assert.rejects(
      () => loadSkillDefinition("missing-runtime"),
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes("runtime.md") &&
        error.message.includes("missing-runtime"),
    );
  } finally {
    process.chdir(originalCwd);
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function main() {
  const claim = await loadSkillDefinition("claim");
  assert.equal(claim.manifest.key, "claim");
  assert.equal(claim.requiresShell, false);
  assert.ok(claim.runtimePrompt.includes("Claim Pinna"));

  const deepResearch = await loadSkillDefinition("deep-research");
  assert.equal(
    shouldAttachShellTool({
      skillRequiresShell: deepResearch.requiresShell,
      allowShell: true,
      runtimeAllowShell: true,
      scope: "PROJECT",
    }),
    true,
  );
  assert.equal(
    shouldAttachShellTool({
      skillRequiresShell: deepResearch.requiresShell,
      allowShell: false,
      runtimeAllowShell: true,
      scope: "PROJECT",
    }),
    false,
  );

  const noteWebResearch = await loadSkillDefinition("note-web-research");
  assert.ok(noteWebResearch.allowedTools.includes("openai_web_search"));
  assert.equal(noteWebResearch.requiresShell, false);
  assert.equal(
    shouldAttachShellTool({
      skillRequiresShell: noteWebResearch.requiresShell,
      allowShell: true,
      runtimeAllowShell: true,
      scope: "NOTE",
    }),
    false,
  );

  const sessionSynthesizer = await loadSkillDefinition("session-synthesizer");
  assert.ok(sessionSynthesizer.allowedTools.includes("get_available_skills"));
  assert.equal(claim.allowedTools.includes("get_available_skills"), false);

  const instructions = buildSkillRuntimeInstructions(claim, {
    scope: "NOTE",
    selectedText: "Selected sentence.",
    threadSummary: "Short summary.",
    allowedToolsSummary: "Allowed tools: extract_claims",
    recentMessages: [{ role: "user", content: "What is the selected text?" }],
  });
  assert.ok(instructions.includes("Selected text"));
  assert.ok(instructions.includes("Allowed tools: extract_claims"));

  await assertMissingRuntimeFails();

  console.log("Layered agent assertions passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
