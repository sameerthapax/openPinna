import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  ExecutedToolCall,
  ToolDescriptor,
} from "@/src/agents/core/agent-types";
import {
  executeTool,
  validateToolAllowed,
} from "@/app/api/_lib/services/tool-registry.service";

export async function executeToolCallForPinna(input: {
  threadId: string;
  messageId: string;
  pinnaTemplateKey: string;
  skillKey: string;
  directive: { toolKey: string; input: Record<string, unknown> };
  noteContext: {
    projectId: string;
    sessionId: string;
    noteId: string;
    noteText?: string;
    sourceText?: string;
  };
}): Promise<ExecutedToolCall> {
  const toolCall = await db.toolCall.create({
    data: {
      threadId: input.threadId,
      messageId: input.messageId,
      toolKey: input.directive.toolKey,
      input: input.directive.input as Prisma.InputJsonValue,
      status: "pending",
    },
  });

  try {
    await validateToolAllowed({
      agentType: "pinna",
      agentKey: input.pinnaTemplateKey,
      skillKey: input.skillKey,
      toolKey: input.directive.toolKey,
      requiredScope: "NOTE",
    });

    const execution = await executeTool({
      toolKey: input.directive.toolKey,
      input: input.directive.input,
      context: {
        threadId: input.threadId,
        projectId: input.noteContext.projectId,
        sessionId: input.noteContext.sessionId,
        noteId: input.noteContext.noteId,
        noteText: input.noteContext.noteText,
        sourceText: input.noteContext.sourceText,
      },
    });

    if (!execution.ok) {
      await db.toolCall.update({
        where: { id: toolCall.id },
        data: {
          status: "failed",
          error: execution.error,
          completedAt: new Date(),
        },
      });

      return {
        id: toolCall.id,
        toolKey: input.directive.toolKey,
        input: input.directive.input,
        status: "failed",
        error: execution.error,
      };
    }

    await db.toolCall.update({
      where: { id: toolCall.id },
      data: {
        status: "completed",
        output: execution.output as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });

    return {
      id: toolCall.id,
      toolKey: input.directive.toolKey,
      input: input.directive.input,
      status: "completed",
      output: execution.output,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tool call denied.";

    await db.toolCall.update({
      where: { id: toolCall.id },
      data: {
        status: "denied",
        error: message,
        completedAt: new Date(),
      },
    });

    return {
      id: toolCall.id,
      toolKey: input.directive.toolKey,
      input: input.directive.input,
      status: "denied",
      error: message,
    };
  }
}

export function toRuntimeTools(allowedTools: ToolDescriptor[]) {
  return allowedTools.map((tool) => ({
    key: tool.key,
    description: tool.description,
    schema: tool.schema,
  }));
}
