import { Prisma, type PrismaClient } from "@prisma/client";
import { agentToolCatalog, pinnaTemplateCatalog } from "@/src/agents/core/agent-catalog";
import { listSkillDefinitions } from "@/src/agents/skills/skill-loader";

type PrismaLike = PrismaClient;

export async function syncSkillsFromFilesystemToDb(prisma: PrismaLike) {
  const skills = await listSkillDefinitions();

  for (const tool of agentToolCatalog) {
    await prisma.agentTool.upsert({
      where: { key: tool.key },
      update: {
        displayName: tool.displayName,
        description: tool.description,
        scope: tool.scope,
        requiresShell: tool.requiresShell,
        schemaJson: tool.schemaJson as Prisma.InputJsonValue,
        handlerName: tool.handlerName,
      },
      create: {
        key: tool.key,
        displayName: tool.displayName,
        description: tool.description,
        scope: tool.scope,
        requiresShell: tool.requiresShell,
        schemaJson: tool.schemaJson as Prisma.InputJsonValue,
        handlerName: tool.handlerName,
      },
    });
  }

  for (const skill of skills) {
    const record = await prisma.pinnaSkill.upsert({
      where: { key: skill.key },
      update: {
        displayName: skill.displayName,
        scope: skill.scope,
        version: skill.version,
        defaultModel: skill.defaultModel,
        requiresShell: skill.requiresShell,
        skillPath: skill.skillDocPath,
        runtimePath: skill.runtimePath,
        manifestJson: skill.manifest as Prisma.InputJsonValue,
      },
      create: {
        key: skill.key,
        displayName: skill.displayName,
        scope: skill.scope,
        version: skill.version,
        defaultModel: skill.defaultModel,
        requiresShell: skill.requiresShell,
        skillPath: skill.skillDocPath,
        runtimePath: skill.runtimePath,
        manifestJson: skill.manifest as Prisma.InputJsonValue,
      },
    });

    for (const toolKey of skill.allowedTools) {
      const tool = await prisma.agentTool.findUnique({
        where: { key: toolKey },
      });

      if (!tool) {
        continue;
      }

      await prisma.pinnaSkillTool.upsert({
        where: {
          skillId_toolId: {
            skillId: record.id,
            toolId: tool.id,
          },
        },
        update: {},
        create: {
          skillId: record.id,
          toolId: tool.id,
        },
      });
    }
  }

  for (const template of pinnaTemplateCatalog) {
    const existingTemplate = await prisma.pinnaTemplate.findUnique({
      where: { key: template.key },
      select: {
        allowShell: true,
        isActive: true,
      },
    });
    const skill = await prisma.pinnaSkill.findUnique({
      where: { key: template.defaultSkillKey },
    });

    const record = await prisma.pinnaTemplate.upsert({
      where: { key: template.key },
      update: {
        name: template.displayName,
        displayName: template.displayName,
        description: template.description,
        defaultTitle: template.defaultTitle,
        systemPrompt: template.systemPrompt,
        scope: template.scope,
        defaultSkillKey: template.defaultSkillKey,
        allowShell: existingTemplate?.allowShell ?? template.allowShell,
        sortOrder: template.sortOrder,
        isActive: existingTemplate?.isActive ?? template.isActive ?? true,
      },
      create: {
        key: template.key,
        name: template.displayName,
        displayName: template.displayName,
        description: template.description,
        defaultTitle: template.defaultTitle,
        systemPrompt: template.systemPrompt,
        scope: template.scope,
        defaultSkillKey: template.defaultSkillKey,
        allowShell: template.allowShell,
        sortOrder: template.sortOrder,
        isActive: template.isActive ?? true,
      },
    });

    if (skill) {
      await prisma.pinnaTemplateSkill.upsert({
        where: {
          pinnaTemplateId_skillId: {
            pinnaTemplateId: record.id,
            skillId: skill.id,
          },
        },
        update: {
          isDefault: true,
        },
        create: {
          pinnaTemplateId: record.id,
          skillId: skill.id,
          isDefault: true,
        },
      });
    }
  }
}
