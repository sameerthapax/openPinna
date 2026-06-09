import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { createThreadKnowledgeEvent } from "@/app/api/_lib/services/knowledge.service";
import { getAllowedToolsForAgent } from "@/app/api/_lib/services/tool-registry.service";
import { threadMemoryQueue } from "@/app/api/_lib/queues";
import { buildPinnaAgentContext } from "@/src/agents/core/agent-factory";
import { buildPinnaMemoryContext } from "@/src/agents/memory/memory-namespace";
import { Mem0MemoryProvider } from "@/src/agents/memory/mem0-provider";
import { openAIPinnaAgentRunner } from "@/src/agents/openai/openai-agent-runner";
import { filterVisibleThreadMessages } from "@/app/api/_lib/services/thread-message.service";
import {
  PersistedChatMessage,
  PinnaTurnStreamSink,
} from "@/src/agents/core/agent-types";

const PINNA_AGENT_DEBUG = process.env.PINNA_AGENT_DEBUG === "1";

function logTiming(step: string, startedAt: number, details: Record<string, unknown> = {}) {
  if (!PINNA_AGENT_DEBUG) return;

  console.log("[PINNA_TIMING]", {
    step,
    ms: Date.now() - startedAt,
    ...details,
  });
}

function serializeChatMessage(message: {
  id: string;
  threadId: string;
  role: string;
  content: string;
  createdAt: Date;
}): PersistedChatMessage {
  return {
    id: message.id,
    threadId: message.threadId,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  };
}

export async function runPinnaThreadTurn(input: {
  threadId: string;
  userMessage: string;
  streamSink?: PinnaTurnStreamSink;
}) {
  const turnStartedAt = Date.now();
  const contextStartedAt = Date.now();
  const emit = (event: Parameters<PinnaTurnStreamSink>[0]) => {
    input.streamSink?.(event);
  };

  emit({
    type: "run.started",
    threadId: input.threadId,
    userMessageLength: input.userMessage.length,
  });

  try {
    const { context, runtimeConfig, thread } = await buildPinnaAgentContext(
      input.threadId,
    );
    logTiming("build_pinna_agent_context", contextStartedAt, {
      threadId: input.threadId,
      pinnaId: context.pinnaId,
    });

    const memoryProvider = new Mem0MemoryProvider();
    const memoryContext = buildPinnaMemoryContext({
      namespace: runtimeConfig.memoryNamespace,
      pinnaId: context.pinnaId,
      threadId: context.threadId,
      noteId: context.noteId,
    });

    const allowedToolsPromise = getAllowedToolsForAgent(
      "pinna",
      thread.pinnaTemplate!.key,
    );

    const memorySearchStartedAt = Date.now();
    const memorySnapshotPromise = memoryProvider.searchContext({
      context: memoryContext,
      query: input.userMessage,
    });
    const memorySearchLoggedPromise = memorySnapshotPromise.then((snapshot) => {
      logTiming("memory_search", memorySearchStartedAt, {
        threadId: input.threadId,
        queryLength: input.userMessage.length,
        degraded: snapshot.degraded,
        itemCount: snapshot.items.length,
      });

      return snapshot;
    });

    const savedUserStartedAt = Date.now();
    const savedUserPromise = db.chatMessage.create({
      data: {
        threadId: input.threadId,
        role: "user",
        content: input.userMessage,
      },
    });

    const savedUser = await savedUserPromise;
    logTiming("db_user_save", savedUserStartedAt, {
      threadId: input.threadId,
      messageId: savedUser.id,
    });

    const knowledgeEventStartedAt = Date.now();
    const knowledgeEventPromise = createThreadKnowledgeEvent({
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
    const knowledgeEventLoggedPromise = knowledgeEventPromise.then(() => {
      logTiming("user_message_event", knowledgeEventStartedAt, {
        threadId: input.threadId,
        messageId: savedUser.id,
      });
    });

    const [allowedTools, memorySnapshot] = await Promise.all([
      allowedToolsPromise,
      memorySearchLoggedPromise,
      knowledgeEventLoggedPromise,
    ]);
    const modelContext = {
      ...context,
      memorySummary: memorySnapshot.summary,
    };

    const openAiRunnerStartedAt = Date.now();
    const agentResult = await openAIPinnaAgentRunner.run({
      context: modelContext,
      userMessage: input.userMessage,
      recentMessages: [...thread.messages]
        .reverse()
        .map((message) => ({ role: message.role, content: message.content })),
      allowedTools,
      userMessageId: savedUser.id,
      pinnaTemplateKey: thread.pinnaTemplate!.key,
      noteContext: {
        projectId: context.projectId,
        sessionId: context.sessionId,
        noteId: context.noteId,
        selectedText: context.selectedText ?? undefined,
        sourceText: thread.note.source?.fullText || thread.note.capture?.selectedText || undefined,
      },
      streamSink: input.streamSink,
    });
    logTiming("openai_runner_call", openAiRunnerStartedAt, {
      threadId: input.threadId,
      userMessageId: savedUser.id,
      toolCount: agentResult.toolCalls.length,
      assistantLength: agentResult.assistantMessage.length,
    });

    agentResult.memoryWrites.push({
      ok: true,
      operation: "appendTurnQueued",
      degraded: false,
      detail: "threadMemoryQueue:thread-memory-append",
    });

    const assistantSaveStartedAt = Date.now();
    const savedAssistant = await db.chatMessage.create({
      data: {
        threadId: input.threadId,
        role: "assistant",
        content: agentResult.assistantMessage,
      },
    });
    logTiming("assistant_save", assistantSaveStartedAt, {
      threadId: input.threadId,
      messageId: savedAssistant.id,
      contentLength: agentResult.assistantMessage.length,
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

    const memoryAppendEnqueueStartedAt = Date.now();
    void threadMemoryQueue.add("thread-memory-append", {
      threadId: input.threadId,
      memoryContext,
      userMessage: input.userMessage,
      assistantMessage: agentResult.assistantMessage,
    }).then(() => {
      logTiming("memory_append_enqueue", memoryAppendEnqueueStartedAt, {
        threadId: input.threadId,
        userMessageId: savedUser.id,
        assistantLength: agentResult.assistantMessage.length,
      });
    }).catch((error) => {
      console.error("[PINNA_TIMING]", {
        step: "memory_append_enqueue_failed",
        threadId: input.threadId,
        userMessageId: savedUser.id,
        detail: error instanceof Error ? error.message : "Unknown queue error.",
      });
    });

    void threadMemoryQueue.add("thread-memory-refresh", {
      threadId: input.threadId,
      rebuildKnowledgeSnapshot: false,
      runKnowledgeChain: false,
    }).catch((error) => {
      console.error("[PINNA_TIMING]", {
        step: "thread_memory_refresh_enqueue_failed",
        threadId: input.threadId,
        detail: error instanceof Error ? error.message : "Unknown queue error.",
      });
    });

    const persistedUserMessage = serializeChatMessage(savedUser);
    const persistedAssistantMessage = serializeChatMessage(savedAssistant);
    const persistedMessages = filterVisibleThreadMessages(
      await db.chatMessage.findMany({
        where: { threadId: input.threadId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
    ).map(serializeChatMessage);

    logTiming("total_turn", turnStartedAt, {
      threadId: input.threadId,
      userMessageId: savedUser.id,
      assistantMessageId: savedAssistant.id,
    });

    const runResult = {
      assistantMessage: agentResult.assistantMessage,
      toolCalls: agentResult.toolCalls,
      memoryWrites: agentResult.memoryWrites,
      observerPayload: agentResult.observerPayload,
      updatedCurrentClaim: agentResult.updatedCurrentClaim ?? null,
    };

    emit({
      type: "run.completed",
      run: runResult,
      userMessage: persistedUserMessage,
      assistantMessage: persistedAssistantMessage,
      messages: persistedMessages,
    });

    return {
      userMessage: savedUser,
      assistantMessage: savedAssistant,
      toolCalls: agentResult.toolCalls,
      memoryWrites: agentResult.memoryWrites,
      observerDecision: null,
      updatedCurrentClaim: agentResult.updatedCurrentClaim ?? null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run pinna thread turn.";
    emit({
      type: "run.error",
      message,
    });
    throw error;
  }
}
