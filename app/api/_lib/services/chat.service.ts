import { db } from "@/lib/db";
import { threadMemoryQueue } from "@/app/api/_lib/queues";
import { generateAssistantReply, parseToolDirective } from "@/app/api/_lib/ai";
import { getPinnaTemplateByKey } from "@/app/api/_lib/services/pinna.service";
import {
  executeTool,
  getAllowedToolsForAgent,
  validateToolAllowed,
} from "@/app/api/_lib/services/tool-registry.service";
import { Prisma } from "@prisma/client";

export async function createThread(input: {
  projectId: string;
  sessionId: string;
  noteId: string;
  pinnaTemplateKey: string;
  title?: string | null;
  customInstructions?: string | null;
}) {
  const template = await getPinnaTemplateByKey(input.pinnaTemplateKey);
  if (!template) {
    throw new Error("Pinna template not found.");
  }

  return db.chatThread.create({
    data: {
      projectId: input.projectId,
      sessionId: input.sessionId,
      noteId: input.noteId,
      pinnaTemplateId: template.id,
      threadType: template.key,
      title: input.title || template.defaultTitle || null,
      customInstructions: input.customInstructions || null,
    },
  });
}

export async function listThreadsByNote(noteId: string) {
  return db.chatThread.findMany({ where: { noteId }, orderBy: { createdAt: "asc" } });
}

export async function getThread(threadId: string) {
  return db.chatThread.findUnique({
    where: { id: threadId },
    include: { messages: true, pinnaTemplate: true },
  });
}

export async function sendMessage(threadId: string, userMessage: string) {
  const thread = await db.chatThread.findUnique({
    where: { id: threadId },
    include: {
      pinnaTemplate: true,
      note: { include: { source: true, capture: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 12 },
    },
  });

  if (!thread) throw new Error("Thread not found.");
  if (!thread.pinnaTemplate) throw new Error("Thread has no pinna template.");

  const allowedTools = await getAllowedToolsForAgent("pinna", thread.pinnaTemplate.key);

  const savedUser = await db.chatMessage.create({
    data: { threadId, role: "user", content: userMessage },
  });

  let toolResult: { toolKey: string; output?: unknown; error?: string } | null = null;
  const directive = parseToolDirective(
    userMessage,
    allowedTools.map((tool) => tool.key),
  );

  if (directive) {
    const toolCall = await db.toolCall.create({
      data: {
        threadId,
        messageId: savedUser.id,
        toolKey: directive.toolKey,
        input: directive.input as Prisma.InputJsonValue,
        status: "pending",
      },
    });

    try {
      await validateToolAllowed({
        agentType: "pinna",
        agentKey: thread.pinnaTemplate.key,
        toolKey: directive.toolKey,
        requiredScope: "note",
      });

      const execution = await executeTool({
        toolKey: directive.toolKey,
        input: directive.input,
        context: {
          threadId: thread.id,
          noteId: thread.noteId,
          noteText: thread.note.noteText,
          sourceText: thread.note.source?.fullText || thread.note.capture?.selectedText || undefined,
        },
      });

      if (!execution.ok) {
        toolResult = { toolKey: directive.toolKey, error: execution.error };
        await db.toolCall.update({
          where: { id: toolCall.id },
          data: {
            status: "failed",
            error: execution.error,
            completedAt: new Date(),
          },
        });
      } else {
        toolResult = { toolKey: directive.toolKey, output: execution.output };
        await db.toolCall.update({
          where: { id: toolCall.id },
          data: {
            status: "completed",
            output: execution.output as Prisma.InputJsonValue,
            completedAt: new Date(),
          },
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool call denied.";
      toolResult = { toolKey: directive.toolKey, error: message };
      await db.toolCall.update({
        where: { id: toolCall.id },
        data: {
          status: "denied",
          error: message,
          completedAt: new Date(),
        },
      });
    }
  }

  const assistant = await generateAssistantReply({
    noteText: thread.note.noteText,
    sourceTitle: thread.note.source?.title,
    captureText: thread.note.capture?.selectedText,
    threadSummary: thread.summary,
    pinnaSystemPrompt: thread.pinnaTemplate.systemPrompt,
    customInstructions: thread.customInstructions,
    allowedTools: allowedTools.map((tool) => ({
      key: tool.key,
      description: tool.description,
      schema: tool.schema,
    })),
    toolResult,
    recentMessages: thread.messages.reverse().map((m) => ({ role: m.role, content: m.content })),
    userMessage,
  });

  const savedAssistant = await db.chatMessage.create({
    data: { threadId, role: "assistant", content: assistant },
  });

  await threadMemoryQueue.add("thread-memory-refresh", { threadId: thread.id });

  return savedAssistant;
}
