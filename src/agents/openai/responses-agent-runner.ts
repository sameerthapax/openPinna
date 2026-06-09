import type {
  ResponseFunctionToolCall,
  ResponseInputItem,
  ResponseCreateParamsBase,
  Response as OpenAIResponse,
  Tool,
} from "openai/resources/responses/responses";
import OpenAI from "openai";
import { getOpenAIClient } from "@/src/agents/openai/openai-client";
import {
  AgentDefinition,
  AgentRunInput,
  AgentRunResult,
  ExecutedToolCall,
  MemoryWriteResult,
} from "@/src/agents/core/agent-types";
import {
  buildAllowedToolsSummary,
  buildSkillRuntimeInstructions,
  loadSkillDefinition,
} from "@/src/agents/core/agent-registry";
import { executeToolCallForPinna } from "@/src/agents/openai/openai-tool-adapter";
import { buildInlineOpenAISkill } from "@/src/agents/openai/skill-sync";

export const RECENT_MESSAGE_LIMIT = 3;
const USE_JSON_RESPONSE_FORMAT = false;
const PINNA_AGENT_DEBUG = process.env.PINNA_AGENT_DEBUG === "1";

type ResponsesFunctionTool = {
  type: "function";
  name: string;
  description?: string | null;
  parameters: Record<string, unknown> | null;
  strict: boolean | null;
};

type ResponsesRequestBody = ResponseCreateParamsBase;

export function shouldAttachShellTool(input: {
  skillRequiresShell: boolean;
  allowShell: boolean;
  runtimeAllowShell: boolean;
  scope: AgentRunInput["context"]["scope"];
}) {
  return (
    input.skillRequiresShell &&
    input.allowShell === true &&
    input.runtimeAllowShell === true &&
    input.scope === "PROJECT"
  );
}

function normalizeToolInput(input: unknown): Record<string, unknown> {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }

  return input === undefined ? {} : { value: input };
}

function normalizeToolSchema(schema: unknown): Record<string, unknown> | null {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return null;
  }

  return schema as Record<string, unknown>;
}

function getResponseText(response: {
  output_text?: string;
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
}) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const assistantMessage = response.output?.find((item) => item.type === "message");
  const text = assistantMessage?.content
    ?.filter((part) => part.type === "output_text")
    .map((part) => part.text || "")
    .join("")
    .trim();

  return text || "";
}

function getAssistantText(response: {
  output_text?: string;
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
}) {
  const raw = getResponseText(response);
  if (!raw) return "";

  try {
    const parsed = JSON.parse(raw) as {
      reply?: unknown;
      message?: unknown;
      internal?: unknown;
      self_check?: unknown;
    };

    if (typeof parsed.reply === "string" && parsed.reply.trim()) {
      return parsed.reply.trim();
    }

    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message.trim();
    }
  } catch {
    // Fallback to raw text if the model did not return JSON.
  }

  return raw;
}

function collectFunctionCalls(response: {
  output?: Array<ResponseFunctionToolCall | { type?: string }>;
}) {
  return (response.output || []).filter(
    (item): item is ResponseFunctionToolCall => item.type === "function_call",
  );
}

function getUpdatedCurrentClaimFromToolCalls(toolCalls: ExecutedToolCall[]) {
  for (let i = toolCalls.length - 1; i >= 0; i -= 1) {
    const output = toolCalls[i].output;
    if (
      output &&
      typeof output === "object" &&
      !Array.isArray(output) &&
      typeof (output as { currentClaim?: unknown }).currentClaim === "string"
    ) {
      const claim = (output as { currentClaim: string }).currentClaim.trim();
      if (claim) return claim;
    }
  }

  return null;
}

function buildConversationInput(input: AgentRunInput) {
  const messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [];

  if (USE_JSON_RESPONSE_FORMAT) {
    messages.push({
      role: "system",
      content:
        'Return json only. Use exactly this json object shape: {"internal":"hidden self-guidance or self-check","reply":"final user-facing reply"}.',
    });
  }

  // Keep raw history compact; thread and memory summaries carry the longer context.
  for (const message of input.recentMessages.slice(-RECENT_MESSAGE_LIMIT)) {
    if (message.role === "user" || message.role === "assistant") {
      messages.push({
        role: message.role,
        content: message.content,
      });
    }
  }

  messages.push({
    role: "user",
    content: input.userMessage,
  });

  return messages;
}

function parseToolArguments(value: string) {
  if (!value.trim()) {
    return {};
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function runResponsesRequest(input: {
  client: ReturnType<typeof getOpenAIClient>;
  requestBody: ResponsesRequestBody;
  streamSink?: (event: { type: "assistant.delta"; delta: string; responseId?: string; iteration: number }) => void;
  iteration: number;
}): Promise<{ response: OpenAIResponse; streamedText: string }> {
  if (!input.streamSink) {
    const response = await input.client.responses.create(input.requestBody);
    return { response: response as OpenAIResponse, streamedText: "" };
  }

  const stream = input.client.responses.stream(
    input.requestBody as Parameters<OpenAI["responses"]["stream"]>[0],
  );
  let streamedText = "";

  for await (const event of stream) {
    if (event.type === "response.output_text.delta") {
      streamedText += event.delta;
      input.streamSink({
        type: "assistant.delta",
        delta: event.delta,
        responseId: event.item_id,
        iteration: input.iteration,
      });
    }
  }

  const response = await stream.finalResponse();
  return { response: response as OpenAIResponse, streamedText };
}

export const openAIPinnaAgentRunner: AgentDefinition<
  AgentRunInput & {
    userMessageId: string;
    pinnaTemplateKey: string;
    noteContext: {
      projectId: string;
      sessionId: string;
      noteId: string;
      selectedText?: string;
      sourceText?: string;
    };
  },
  AgentRunResult
> = {
  kind: "pinna",
  key: "openai-responses-runner",
  async run(input) {
    const client = getOpenAIClient();
    const skill = await loadSkillDefinition(input.context.skillKey);
    const prompt = buildSkillRuntimeInstructions(skill, {
      scope: input.context.scope,
      customInstructions: input.context.customInstructions,
      memorySummary: input.context.memorySummary,
      projectSummary: input.context.projectSummary,
      sessionSummary: input.context.sessionSummary,
      sourceTitle: input.context.sourceTitle,
      selectedText: input.context.selectedText,
      currentClaim: input.context.currentClaim,
      baseKnowledgeVersion: input.context.baseKnowledgeVersion,
      threadSummary: input.context.threadSummary,
      allowedToolsSummary: buildAllowedToolsSummary(input.allowedTools),
      recentMessages: input.recentMessages,
    });

    const executedToolCalls: ExecutedToolCall[] = [];
    const functionTools: ResponsesFunctionTool[] = input.allowedTools.map((allowedTool) => ({
      type: "function",
      name: allowedTool.key,
      description:
        allowedTool.description?.trim() || `Execute the ${allowedTool.key} tool.`,
      parameters: normalizeToolSchema(allowedTool.schema),
      strict: false,
    }));


    const shouldAttachShell = shouldAttachShellTool({
      skillRequiresShell: skill.requiresShell,
      allowShell: input.context.allowShell,
      runtimeAllowShell: input.context.runtimeAllowShell,
      scope: input.context.scope,
    });

    const tools: Tool[] = [...functionTools];

    if (shouldAttachShell) {
      const inlineSkill = await buildInlineOpenAISkill(skill.key);
      tools.push({
        type: "shell",
        environment: {
          type: "container_auto",
          skills: [inlineSkill],
        },
      } as Tool);
    }

    const responseOptions = USE_JSON_RESPONSE_FORMAT
      ? {
          text: {
            format: {
              type: "json_object" as const,
            },
          },
        }
      : {};

    const openAiRequestStartedAt = Date.now();
    const requestBody = {
      model: skill.defaultModel,
      instructions: prompt,
      input: buildConversationInput(input),
      ...responseOptions,
      tools,
      parallel_tool_calls: true,
      store: true,
      metadata: {
        thread_id: input.context.threadId,
        pinna_id: input.context.pinnaId,
        note_id: input.context.noteId,
        scope: input.context.scope,
        skill_key: skill.key,
      },
    };

    const initialRequest = await runResponsesRequest({
      client,
      requestBody,
      iteration: 0,
      streamSink: input.streamSink,
    });
    let response = initialRequest.response;

    for (let iteration = 0; iteration < 8; iteration += 1) {
      const functionCalls = collectFunctionCalls(response);
      console.log("[TOOL_CALLS_FROM_OPENAI]", {

        count: functionCalls.length,

        calls: functionCalls.map((call) => ({

          name: call.name,

          callId: call.call_id,

          arguments: call.arguments,

        })),

      });
      if (functionCalls.length === 0) {
        break;
      }

      const toolOutputs: ResponseInputItem.FunctionCallOutput[] = [];

      for (const functionCall of functionCalls) {
        input.streamSink?.({
          type: "tool.started",
          toolKey: functionCall.name,
          toolCallId: functionCall.call_id,
          iteration,
        });
        console.log("[EXECUTING_TOOL_CALL]", {
          toolKey: functionCall.name,
          args: parseToolArguments(functionCall.arguments),
          threadId: input.context.threadId,
        });

        const execution = await executeToolCallForPinna({
          threadId: input.context.threadId,
          messageId: input.userMessageId,
          pinnaTemplateKey: input.pinnaTemplateKey,
          skillKey: skill.key,
          directive: {
            toolKey: functionCall.name,
            input: normalizeToolInput(parseToolArguments(functionCall.arguments)),
          },
          noteContext: input.noteContext,
        });

        executedToolCalls.push(execution);

        input.streamSink?.({
          type: "tool.completed",
          toolKey: execution.toolKey,
          toolCallId: functionCall.call_id,
          iteration,
          status: execution.status,
        });

        toolOutputs.push({
          type: "function_call_output",
          call_id: functionCall.call_id,
          output: JSON.stringify({
            status: execution.status,
            toolKey: execution.toolKey,
            output: execution.output ?? null,
            error: execution.error ?? null,
          }),
        });
      }


      const retryStartedAt = Date.now();
      const retryRequest = {
        model: skill.defaultModel,
        previous_response_id: response.id,
        input: toolOutputs,
        ...responseOptions,
        tools,
        parallel_tool_calls: true,
        store: true,
      };

      const streamedRetry = await runResponsesRequest({
        client,
        requestBody: retryRequest,
        iteration: iteration + 1,
        streamSink: input.streamSink,
      });
      response = streamedRetry.response;

      if (PINNA_AGENT_DEBUG) {
        console.log("[PINNA_TIMING]", {
          step: "openai_responses_retry",
          ms: Date.now() - retryStartedAt,
          threadId: input.context.threadId,
          toolCallCount: toolOutputs.length,
        });
      }
    }

    const assistantMessage = getAssistantText(response);
    const updatedCurrentClaim = getUpdatedCurrentClaimFromToolCalls(executedToolCalls);

    if (PINNA_AGENT_DEBUG) {
      console.log("[PINNA_TIMING]", {
        step: "openai_responses_create",
        ms: Date.now() - openAiRequestStartedAt,
        threadId: input.context.threadId,
        responseId: response.id,
      });
    }

    return {
      assistantMessage,
      toolCalls: executedToolCalls,
      memoryWrites: [] as MemoryWriteResult[],
      updatedCurrentClaim,
      observerPayload: {
        lastUserMessage: input.userMessage,
        lastAssistantMessage: assistantMessage,
        toolCalls: executedToolCalls,
      },
    };
  },
};
