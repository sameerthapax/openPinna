import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { createThreadKnowledgeEvent } from "@/app/api/_lib/services/knowledge.service";
import { getAllowedToolsForAgent } from "@/app/api/_lib/services/tool-registry.service";
import { threadMemoryQueue } from "@/app/api/_lib/queues";
import { buildPinnaAgentContext } from "@/src/agents/core/agent-factory";
import { Mem0MemoryProvider } from "@/src/agents/memory/mem0-provider";
import { buildPinnaMemoryContext } from "@/src/agents/memory/memory-namespace";
import { openAIPinnaAgentRunner } from "@/src/agents/openai/openai-agent-runner";

export async function runPinnaThreadTurn(input: {
  threadId: string;
  userMessage: string;
}) {
  const { context, runtimeConfig, thread } = await buildPinnaAgentContext(
    input.threadId,
  );

  const allowedTools = await getAllowedToolsForAgent(
    "pinna",
    thread.pinnaTemplate!.key,
  );

  const memoryProvider = new Mem0MemoryProvider();
  const memoryContext = buildPinnaMemoryContext({
    namespace: runtimeConfig.memoryNamespace,
    pinnaId: context.pinnaId,
    threadId: context.threadId,
    noteId: context.noteId,
  });

  const memorySnapshot = await memoryProvider.searchContext({
    context: memoryContext,
    query: input.userMessage,
  });

  const savedUser = await db.chatMessage.create({
    data: {
      threadId: input.threadId,
      role: "user",
      content: input.userMessage,
    },
  });

  await createThreadKnowledgeEvent({
    threadId: input.threadId,
    eventType: "user_message",
    actor: "user",
    messageRef: savedUser.id,
    content: input.userMessage,
    payload: {
      role: "user",
      content: input.userMessage,
    } as Prisma.InputJsonValue,
  });

  const agentResult = await openAIPinnaAgentRunner.run({
    context: {
      ...context,
      memorySummary: memorySnapshot.summary,
    },
    userMessage: input.userMessage,
    recentMessages: thread.messages
      .reverse()
      .map((message) => ({ role: message.role, content: message.content })),
    allowedTools,
    userMessageId: savedUser.id,
    pinnaTemplateKey: thread.pinnaTemplate!.key,
    noteContext: {
      projectId: context.projectId,
      sessionId: context.sessionId,
      noteId: context.noteId,
      noteText: context.noteText ?? undefined,
      sourceText: thread.note.source?.fullText || thread.note.capture?.selectedText || undefined,
    },
  });

  const memoryWrite = await memoryProvider.appendTurn({
    context: memoryContext,
    userMessage: input.userMessage,
    assistantMessage: agentResult.assistantMessage,
  });
  agentResult.memoryWrites.push(memoryWrite);

  const savedAssistant = await db.chatMessage.create({
    data: {
      threadId: input.threadId,
      role: "assistant",
      content: agentResult.assistantMessage,
    },
  });

  await createThreadKnowledgeEvent({
    threadId: input.threadId,
    eventType: "assistant_message",
    actor: "assistant",
    messageRef: savedAssistant.id,
    content: agentResult.assistantMessage,
    payload: {
      role: "assistant",
      content: agentResult.assistantMessage,
      toolCalls: agentResult.toolCalls.map((toolCall) => ({
        id: toolCall.id,
        toolKey: toolCall.toolKey,
        status: toolCall.status,
      })),
    } as Prisma.InputJsonValue,
  });

  await threadMemoryQueue.add("thread-memory-refresh", {
    threadId: input.threadId,
    rebuildKnowledgeSnapshot: false,
    runKnowledgeChain: false,
  });

  return {
    userMessage: savedUser,
    assistantMessage: savedAssistant,
    toolCalls: agentResult.toolCalls,
    memoryWrites: agentResult.memoryWrites,
    observerDecision: null,
  };
}
