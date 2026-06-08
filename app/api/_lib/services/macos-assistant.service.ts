import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getOpenAIClient } from "@/src/agents/openai/openai-client";
import {
  type PersistedResearchResult,
  type ResearchCaptureOrigin,
  type ResearchNoteDecision,
} from "@/app/api/_lib/services/research-note-ingest.service";
import { listProjects } from "@/app/api/_lib/services/project.service";
import { Mem0MemoryProvider } from "@/src/agents/memory/mem0-provider";

const assistantModel =
  process.env.OPENAI_MACOS_ASSISTANT_MODEL || "gpt-4.1-mini";
const ttsModel = process.env.OPENAI_MACOS_TTS_MODEL || "gpt-4o-mini-tts";
const ttsVoice = process.env.OPENAI_MACOS_TTS_VOICE || "alloy";
const transcriptionModel =
  process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe";

type ConversationTurn = {
  role: string;
  content: string;
};

type ScreenshotInput = {
  file: File;
  mimeType?: string | null;
  label?: string | null;
  isCursorScreen?: boolean;
  displayIndex?: number | null;
};

type RespondToAssistantInput = {
  mode: "normal" | "research";
  requestKind?: "assistant_reply" | "pointing_coordinate" | "pointing_verify";
  transcript: string;
  userPrompt?: string | null;
  pageUrl?: string | null;
  pageTitle?: string | null;
  selectedText?: string | null;
  sourceMetadata?: Record<string, unknown> | null;
  conversationHistory?: ConversationTurn[];
  screenshots?: ScreenshotInput[];
  projectId?: string | null;
  captureOrigin?: ResearchCaptureOrigin | null;
};

type MacOSAssistantMemoryMode = "clicky" | "clicky-research";

function requireOpenAIKey() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY_MISSING");
  }

  return apiKey;
}

function normalizeObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getTmpAssistantDir() {
  return path.join(os.tmpdir(), "openpinna-macos-assistant");
}

function buildMacOSAssistantMemoryContext(mode: MacOSAssistantMemoryMode) {
  return {
    namespace: `desktop:${mode}`,
    pinnaId: `desktop-${mode}`,
    threadId: `desktop-${mode}`,
    noteId: `desktop-${mode}`,
  };
}

async function searchMacOSAssistantMemory(
  mode: MacOSAssistantMemoryMode,
  query: string,
) {
  const memoryProvider = new Mem0MemoryProvider();
  return memoryProvider.searchContext({
    context: buildMacOSAssistantMemoryContext(mode),
    query,
  });
}

async function appendMacOSAssistantMemoryTurn(input: {
  mode: MacOSAssistantMemoryMode;
  userMessage: string;
  assistantMessage: string;
}) {
  const memoryProvider = new Mem0MemoryProvider();
  return memoryProvider.appendTurn({
    context: buildMacOSAssistantMemoryContext(input.mode),
    userMessage: input.userMessage,
    assistantMessage: input.assistantMessage,
  });
}

async function writeTempUpload(prefix: string, file: File) {
  const dir = getTmpAssistantDir();
  await mkdir(dir, { recursive: true });
  const extension = path.extname(file.name || "") || ".bin";
  const filename = `${prefix}-${Date.now()}-${randomUUID()}${extension}`;
  const fullPath = path.join(dir, filename);
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(fullPath, bytes);

  return {
    filePath: fullPath,
    sizeBytes: bytes.length,
    mimeType: file.type || null,
  };
}

function extractResponseText(responseJson: unknown) {
  const responseRecord = normalizeObject(responseJson);
  if (!responseRecord) {
    return "";
  }

  if (typeof responseRecord.output_text === "string") {
    return responseRecord.output_text.trim();
  }

  const output = Array.isArray(responseRecord.output)
    ? responseRecord.output
    : [];
  const parts: string[] = [];

  for (const item of output) {
    const record = normalizeObject(item);
    const content = Array.isArray(record?.content) ? record.content : [];
    for (const entry of content) {
      const contentRecord = normalizeObject(entry);
      const text =
        typeof contentRecord?.text === "string"
          ? contentRecord.text
          : typeof contentRecord?.value === "string"
            ? contentRecord.value
            : "";
      if (text) {
        parts.push(text);
      }
    }
  }

  return parts.join("").trim();
}

function buildSystemPrompt(
  mode: "normal" | "research",
  requestKind: "assistant_reply" | "pointing_coordinate" | "pointing_verify",
  sourceMetadata?: Record<string, unknown> | null,
) {
  const desktopPrompt =
    sourceMetadata && typeof sourceMetadata.desktopSystemPrompt === "string"
      ? sourceMetadata.desktopSystemPrompt.trim()
      : "";

  if (requestKind !== "assistant_reply") {
    return desktopPrompt || "return only the requested structured output.";
  }

  const basePrompt = [
    "you are openpinna desktop, a calm macos research companion that speaks naturally.",
    "write for speech: short sentences, no markdown, no lists, no emojis.",
    "if the user asks about something on screen, use the screenshots and page context.",
  ];

  if (mode === "research") {
    basePrompt.push(
      "research mode is active.",
      "optimize for grounded explanation, capturing useful research context, and helping the user preserve the value of what they are looking at.",
    );
  }

  if (desktopPrompt && mode !== "research") {
    basePrompt.push(`desktop prompt context: ${desktopPrompt}`);
  }

  return basePrompt.join(" ");
}

function sanitizeSourceMetadataForModel(
  sourceMetadata?: Record<string, unknown> | null,
) {
  const normalized = normalizeObject(sourceMetadata);
  if (!normalized) {
    return null;
  }

  const rest = { ...normalized };
  delete rest.desktopSystemPrompt;
  delete rest.desktopAssistantModel;
  return Object.keys(rest).length > 0 ? rest : null;
}

function fallbackResponseText(
  requestKind: "assistant_reply" | "pointing_coordinate" | "pointing_verify",
) {
  return requestKind === "assistant_reply"
    ? "I couldn't generate a response."
    : "{}";
}

async function callResponsesAPI(input: {
  mode: "normal" | "research";
  requestKind: "assistant_reply" | "pointing_coordinate" | "pointing_verify";
  transcript: string;
  userPrompt?: string | null;
  pageUrl?: string | null;
  pageTitle?: string | null;
  selectedText?: string | null;
  sourceMetadata?: Record<string, unknown> | null;
  conversationHistory?: ConversationTurn[];
  screenshots?: ScreenshotInput[];
  memorySummary?: string | null;
}) {
  const apiKey = requireOpenAIKey();
  const content: Array<Record<string, unknown>> = [];
  const modelSourceMetadata = sanitizeSourceMetadataForModel(
    input.sourceMetadata,
  );

  if (input.pageTitle || input.pageUrl || input.selectedText) {
    content.push({
      type: "input_text",
      text: [
        input.pageTitle ? `Page title: ${input.pageTitle}` : "",
        input.pageUrl ? `Page URL: ${input.pageUrl}` : "",
        input.selectedText ? `Selected text: ${input.selectedText}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    });
  }

  if (modelSourceMetadata) {
    content.push({
      type: "input_text",
      text: `Source metadata: ${JSON.stringify(modelSourceMetadata).slice(0, 4000)}`,
    });
  }

  for (const screenshot of input.screenshots || []) {
    const stored = await writeTempUpload("screen", screenshot.file);
    const bytes = await readFile(stored.filePath);
    const mimeType = screenshot.mimeType || stored.mimeType || "image/jpeg";
    content.push({
      type: "input_image",
      image_url: `data:${mimeType};base64,${bytes.toString("base64")}`,
    });

    if (screenshot.label || typeof screenshot.displayIndex === "number") {
      content.push({
        type: "input_text",
        text: [
          screenshot.label ? `Screenshot label: ${screenshot.label}` : "",
          typeof screenshot.displayIndex === "number"
            ? `Display index: ${screenshot.displayIndex}`
            : "",
          screenshot.isCursorScreen ? "Cursor is on this screen." : "",
        ]
          .filter(Boolean)
          .join("\n"),
      });
    }
  }

  const userQuestion = (input.userPrompt || input.transcript).trim();
  if (input.memorySummary?.trim()) {
    content.push({
      type: "input_text",
      text: `Long-term memory:\n${input.memorySummary.trim().slice(0, 4000)}`,
    });
  }

  content.push({
    type: "input_text",
    text: `User said: ${userQuestion}`,
  });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: assistantModel,
      instructions: buildSystemPrompt(
        input.mode,
        input.requestKind,
        input.sourceMetadata,
      ),
      input: [
        {
          role: "user",
          content,
        },
      ],
    }),
  });

  const responseJson = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | Record<string, unknown>
    | null;

  if (!response.ok) {
    throw new Error(
      responseJson &&
        typeof responseJson === "object" &&
        "error" in responseJson
        ? (responseJson.error as { message?: string } | undefined)?.message ||
            `Assistant request failed with status ${response.status}.`
        : `Assistant request failed with status ${response.status}.`,
    );
  }

  const spokenText = extractResponseText(responseJson);
  return spokenText || fallbackResponseText(input.requestKind);
}

type ResearchProjectCandidate = {
  id: string;
  title: string;
};

function buildResearchIngestPrompt(input: {
  transcript: string;
  userPrompt?: string | null;
  pageUrl?: string | null;
  pageTitle?: string | null;
  selectedText?: string | null;
  sourceMetadata?: Record<string, unknown> | null;
  projects: ResearchProjectCandidate[];
  explicitProjectId?: string | null;
  memorySummary?: string | null;
}) {
  const sanitizedMetadata = sanitizeSourceMetadataForModel(
    input.sourceMetadata,
  );

  return [
    "You classify a research capture request for openPinna.",
    "The only supported task is adding a note into an existing project.",
    "Return a function call only.",
    "Use projectName only when the user clearly referenced one of the available project titles.",
    "If an explicit project id was already supplied, leave projectName empty unless it reinforces the same project.",
    "Set userCommentary to the user's research note content.",
    "Set taskSummary to a short imperative summary of the capture task.",
    "Do not invent project names, sources, URLs, authors, or selected text.",
    "",
    `Transcript: ${input.transcript.trim() || "None"}`,
    `User prompt: ${input.userPrompt?.trim() || "None"}`,
    `Page title: ${input.pageTitle?.trim() || "None"}`,
    `Page URL: ${input.pageUrl?.trim() || "None"}`,
    `Selected text: ${input.selectedText?.trim() || "None"}`,
    `Explicit project id: ${input.explicitProjectId || "None"}`,
    `Available projects: ${JSON.stringify(input.projects.map((project) => project.title))}`,
    `Long-term memory: ${input.memorySummary?.trim() || "None"}`,
    sanitizedMetadata
      ? `Source metadata: ${JSON.stringify(sanitizedMetadata).slice(0, 4000)}`
      : "Source metadata: None",
  ].join("\n");
}

async function createResearchNoteDecision(input: {
  transcript: string;
  userPrompt?: string | null;
  pageUrl?: string | null;
  pageTitle?: string | null;
  selectedText?: string | null;
  sourceMetadata?: Record<string, unknown> | null;
  explicitProjectId?: string | null;
  memorySummary?: string | null;
}): Promise<ResearchNoteDecision> {
  const projects = await listProjects();
  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: assistantModel,
    temperature: 0.1,
    input: [
      {
        role: "system",
        content:
          "You are openPinna research mode. Turn the user request into a structured note-ingest decision for an existing project.",
      },
      {
        role: "user",
        content: buildResearchIngestPrompt({
          transcript: input.transcript,
          userPrompt: input.userPrompt,
          pageUrl: input.pageUrl,
          pageTitle: input.pageTitle,
          selectedText: input.selectedText,
          sourceMetadata: input.sourceMetadata,
          projects: projects.map((project) => ({
            id: project.id,
            title: project.title,
          })),
          explicitProjectId: input.explicitProjectId,
          memorySummary: input.memorySummary,
        }),
      },
    ],
    tools: [
      {
        type: "function",
        name: "prepare_research_note",
        description:
          "Prepare the structured task and commentary needed to add a note into an existing project.",
        strict: true,
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            taskType: {
              type: "string",
              enum: ["add_note_to_project"],
            },
            projectName: {
              type: ["string", "null"],
              description:
                "Closest matching project title from the provided list, or null when no title was clearly referenced.",
            },
            taskSummary: {
              type: "string",
              description:
                "Short imperative description of the action being taken.",
            },
            userCommentary: {
              type: "string",
              description:
                "The user's research note/commentary that should be saved with the note.",
            },
            sessionHint: {
              type: ["string", "null"],
              description:
                "Optional session hint if the user explicitly referenced one.",
            },
          },
          required: [
            "taskType",
            "projectName",
            "taskSummary",
            "userCommentary",
            "sessionHint",
          ],
        },
      },
    ],
    tool_choice: {
      type: "function",
      name: "prepare_research_note",
    },
  });

  const toolCall = (response.output || []).find((entry) => {
    return entry.type === "function_call" && entry.name === "prepare_research_note";
  });

  if (!toolCall || toolCall.type !== "function_call") {
    throw new Error("RESEARCH_DECISION_MISSING");
  }

  const parsed = JSON.parse(toolCall.arguments || "{}") as ResearchNoteDecision;
  const commentary =
    parsed.userCommentary?.trim() ||
    input.transcript.trim() ||
    input.userPrompt?.trim() ||
    "";

  if (!commentary) {
    throw new Error("RESEARCH_COMMENTARY_MISSING");
  }

  return {
    taskType: "add_note_to_project",
    projectName: parsed.projectName?.trim() || null,
    taskSummary:
      parsed.taskSummary?.trim() ||
      "Add this research note to the selected project",
    userCommentary: commentary,
    sessionHint: parsed.sessionHint?.trim() || null,
  };
}

async function persistStructuredResearchArtifacts(
  input: RespondToAssistantInput,
): Promise<PersistedResearchResult> {
  const { persistResearchNote } = await import(
    "@/app/api/_lib/services/research-note-ingest.service"
  );
  const memorySummary = (
    await searchMacOSAssistantMemory(
      "clicky-research",
      input.userPrompt?.trim() || input.transcript.trim(),
    )
  ).summary;

  const decision = await createResearchNoteDecision({
    transcript: input.transcript,
    userPrompt: input.userPrompt,
    pageUrl: input.pageUrl,
    pageTitle: input.pageTitle,
    selectedText: input.selectedText,
    sourceMetadata: input.sourceMetadata,
    explicitProjectId: input.projectId,
    memorySummary,
  });

  const persisted = await persistResearchNote({
    mode: input.mode,
    transcript: input.transcript,
    userPrompt: input.userPrompt,
    pageUrl: input.pageUrl,
    pageTitle: input.pageTitle,
    selectedText: input.selectedText,
    sourceMetadata: input.sourceMetadata,
    screenshots: (input.screenshots || []).map((screenshot) => ({
      file: screenshot.file,
      fileName: screenshot.file.name || "screen.jpg",
      mimeType: screenshot.mimeType || screenshot.file.type || null,
      label: screenshot.label || null,
    })),
    captureOrigin: input.captureOrigin || null,
    projectId: input.projectId,
    decision,
  });

  await appendMacOSAssistantMemoryTurn({
    mode: "clicky-research",
    userMessage: input.userPrompt?.trim() || input.transcript.trim(),
    assistantMessage: persisted.confirmationText,
  });

  return persisted;
}

export async function transcribeMacosAudio(input: {
  audioFile: File;
  languageHint?: string | null;
}) {
  const apiKey = requireOpenAIKey();
  const formData = new FormData();
  formData.append("model", transcriptionModel);
  formData.append(
    "file",
    input.audioFile,
    input.audioFile.name || "utterance.wav",
  );
  if (input.languageHint?.trim()) {
    formData.append("language", input.languageHint.trim());
  }

  const response = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    },
  );

  const json = (await response.json().catch(() => null)) as {
    text?: string;
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    throw new Error(
      json?.error?.message ||
        `Transcription request failed with status ${response.status}.`,
    );
  }

  return {
    transcript: (json?.text || "").trim(),
    model: transcriptionModel,
  };
}

export async function respondToMacosAssistant(input: RespondToAssistantInput) {
  const requestKind = input.requestKind ?? "assistant_reply";
  if (input.mode === "research" && requestKind === "assistant_reply") {
    const persisted = await persistStructuredResearchArtifacts(input);

    return {
      mode: input.mode,
      requestKind,
      transcript: input.transcript.trim(),
      spokenText: persisted.confirmationText,
      pointTarget: null,
      persisted,
    };
  }

  const memorySummary =
    requestKind === "assistant_reply"
      ? (
          await searchMacOSAssistantMemory(
            "clicky",
            input.userPrompt?.trim() || input.transcript.trim(),
          )
        ).summary
      : null;

  const spokenText = await callResponsesAPI({
    ...input,
    requestKind,
    conversationHistory: [],
    memorySummary,
  });

  if (requestKind === "assistant_reply") {
    await appendMacOSAssistantMemoryTurn({
      mode: "clicky",
      userMessage: input.userPrompt?.trim() || input.transcript.trim(),
      assistantMessage: spokenText,
    });
  }

  return {
    mode: input.mode,
    requestKind,
    transcript: input.transcript.trim(),
    spokenText,
    pointTarget: null,
    persisted: null,
  };
}

export async function synthesizeMacosSpeech(text: string) {
  const apiKey = requireOpenAIKey();
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ttsModel,
      voice: ttsVoice,
      input: text,
      format: "mp3",
    }),
  });

  if (!response.ok) {
    const json = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(
      json?.error?.message ||
        `Speech synthesis failed with status ${response.status}.`,
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    bytes,
    contentType: response.headers.get("content-type") || "audio/mpeg",
    model: ttsModel,
    voice: ttsVoice,
  };
}
