import { z, ZodTypeAny } from "zod";
import {
  FinalizedScreenshotInfo,
  finalizedScreenshotInfoSchema,
  NoteKnowledgeSections,
  noteKnowledgeSectionsSchema,
  processingLogPrefix,
  SourceMetadataSummary,
  sourceMetadataSummarySchema,
} from "@/src/processing/processingTypes";

const chatCompletionsUrl = "https://api.openai.com/v1/chat/completions";
const defaultProcessingModel =
  process.env.OPENAI_PROCESSING_MODEL?.trim() || "gpt-4.1-mini";

function getApiKey() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY_MISSING");
  }

  return apiKey;
}

async function createChatCompletion(input: {
  systemPrompt: string;
  userText: string;
  operation: string;
}) {
  console.info(`${processingLogPrefix} openai request started`, {
    operation: input.operation,
    model: defaultProcessingModel,
  });

  const response = await fetch(chatCompletionsUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: defaultProcessingModel,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: input.userText },
      ],
    }),
  });

  const json = (await response.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string | null } }>;
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    throw new Error(
      json?.error?.message ||
        `OpenAI request failed with status ${response.status}.`,
    );
  }

  const contentText = json?.choices?.[0]?.message?.content?.trim();

  if (!contentText) {
    throw new Error("OPENAI_EMPTY_RESPONSE");
  }

  console.info(`${processingLogPrefix} openai request completed`, {
    operation: input.operation,
    model: defaultProcessingModel,
    responseLength: contentText.length,
  });

  return contentText;
}

async function parseJsonWithRepair<S extends ZodTypeAny>(
  schema: S,
  responseText: string,
  repairContext: string,
): Promise<z.output<S>> {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(responseText);
  } catch {
    parsedJson = responseText;
  }

  const firstPass = schema.safeParse(parsedJson);

  if (firstPass.success) {
    console.info(`${processingLogPrefix} openai json parse succeeded`, {
      repairContext,
      repaired: false,
    });
    return firstPass.data;
  }

  console.warn(
    `${processingLogPrefix} openai json parse failed, attempting repair`,
    {
      repairContext,
    },
  );

  const repairedText = await createChatCompletion({
    operation: `${repairContext}:repair`,
    systemPrompt:
      "Repair the supplied JSON so it strictly matches the requested schema. Return JSON only with no prose.",
    userText: [
      `Schema target: ${repairContext}`,
      "Original response:",
      responseText,
      "Validation issues:",
      JSON.stringify(firstPass.error.flatten(), null, 2),
    ].join("\n\n"),
  });

  const repaired = schema.parse(JSON.parse(repairedText));
  console.info(`${processingLogPrefix} openai json repair succeeded`, {
    repairContext,
    repaired: true,
  });
  return repaired;
}

async function requestStructuredJson<S extends ZodTypeAny>(input: {
  schema: S;
  schemaName: string;
  systemPrompt: string;
  userText: string;
}): Promise<z.output<S>> {
  const responseText = await createChatCompletion({
    operation: input.schemaName,
    systemPrompt: input.systemPrompt,
    userText: input.userText,
  });

  return parseJsonWithRepair(input.schema, responseText, input.schemaName);
}

export async function finalizeScreenshotInformation(input: {
  pageTitle?: string | null;
  pageUrl?: string | null;
  selectedText?: string | null;
  mergedRawText: string;
}): Promise<FinalizedScreenshotInfo> {
  return requestStructuredJson({
    schema: finalizedScreenshotInfoSchema,
    schemaName: "FinalizedScreenshotInfo",
    systemPrompt: [
      "You finalize ordered OCR text from one screenshot session.",
      "Use the OCR text as the primary evidence source and do not invent content not supported by it.",
      "You may use selected text only as supporting context when it helps connect the screenshot to the note.",
      "Return JSON only with keys: finalizedSummary, importantContext, model.",
      "finalizedSummary should be a compact summary of what the screenshot content shows.",
      "importantContext should capture the most useful concrete details for downstream note knowledge.",
    ].join(" "),
    userText: [
      `Page title: ${input.pageTitle || "Unknown"}`,
      `Page URL: ${input.pageUrl || "Unknown"}`,
      `Selected text: ${input.selectedText || "None"}`,
      "Ordered OCR text:",
      input.mergedRawText || "None",
      `Set model to "${defaultProcessingModel}".`,
    ].join("\n"),
  });
}

export async function extractSourceMetadataAndSummary(input: {
  noteText: string;
  selectedText?: string | null;
  userComment?: string | null;
  screenshotImportantText?: string | null;
  transcriptText?: string | null;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  existingAuthors?: string[];
  existingAbstract?: string | null;
  existingPublicationDate?: string | null;
}): Promise<SourceMetadataSummary> {
  return requestStructuredJson({
    schema: sourceMetadataSummarySchema,
    schemaName: "SourceMetadataSummary",
    systemPrompt: [
      "You extract source metadata and a grounded note summary from captured research context.",
      "Do not invent missing bibliographic facts. Use null for unknown title, publicationDate, or abstract.",
      "authors must be an array of strings. summary should be concise and evidence-grounded.",
      "Return JSON only with keys: title, authors, publicationDate, abstract, summary, model.",
    ].join(" "),
    userText: [
      `Source title: ${input.sourceTitle || "Unknown"}`,
      `Source URL: ${input.sourceUrl || "Unknown"}`,
      `Existing authors: ${JSON.stringify(input.existingAuthors || [])}`,
      `Existing publication date: ${input.existingPublicationDate || "Unknown"}`,
      `Existing abstract: ${input.existingAbstract || "Unknown"}`,
      `Note text: ${input.noteText}`,
      `Selected text: ${input.selectedText || "None"}`,
      `User comment: ${input.userComment || "None"}`,
      `Screenshot context: ${input.screenshotImportantText || "None"}`,
      `Transcript text: ${input.transcriptText || "None"}`,
      `Set model to "${defaultProcessingModel}".`,
    ].join("\n\n"),
  });
}

export async function buildNoteKnowledge(input: {
  noteText: string;
  selectedText?: string | null;
  userComment?: string | null;
  screenshotImportantText?: string | null;
  transcriptText?: string | null;
  sourceSummary?: string | null;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  sourceAbstract?: string | null;
  authors?: string[];
  publicationDate?: string | null;
}): Promise<NoteKnowledgeSections> {
  return requestStructuredJson({
    schema: noteKnowledgeSectionsSchema,
    schemaName: "NoteKnowledgeSections",
    systemPrompt: [
      "You build grounded note knowledge for a research note.",
      "Return exactly three sections in JSON only: keyFindings, userView, conclusion, model.",
      "The combined word count across the three sections must be at least 200 words.",
      "Key Findings should focus on the source and evidence.",
      "User View should focus on the user's interpretation, interest, or practical angle.",
      "Conclusion should synthesize what matters next without adding unsupported claims.",
      `Set model to "${defaultProcessingModel}".`,
    ].join(" "),
    userText: [
      `Source title: ${input.sourceTitle || "Unknown"}`,
      `Source URL: ${input.sourceUrl || "Unknown"}`,
      `Authors: ${JSON.stringify(input.authors || [])}`,
      `Publication date: ${input.publicationDate || "Unknown"}`,
      `Source abstract: ${input.sourceAbstract || "Unknown"}`,
      `Source summary: ${input.sourceSummary || "Unknown"}`,
      `Note text: ${input.noteText}`,
      `Selected text: ${input.selectedText || "None"}`,
      `User comment: ${input.userComment || "None"}`,
      `Screenshot context: ${input.screenshotImportantText || "None"}`,
      `Transcript text: ${input.transcriptText || "None"}`,
    ].join("\n\n"),
  });
}

export function getProcessingModel() {
  return defaultProcessingModel;
}
