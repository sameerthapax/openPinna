import { readFile } from "node:fs/promises";
import path from "node:path";
import { z, ZodTypeAny } from "zod";
import {
  ClickyScreenshotExtraction,
  clickyScreenshotExtractionSchema,
  GroundedSourceSummary,
  groundedSourceSummarySchema,
  NoteKnowledgeSections,
  noteKnowledgeSectionsSchema,
  processingLogPrefix,
  ScreenshotFieldExtraction,
  screenshotFieldExtractionSchema,
} from "@/src/processing/processingTypes";

const responsesUrl = "https://api.openai.com/v1/responses";
const defaultProcessingModel =
  process.env.OPENAI_PROCESSING_MODEL?.trim() || "gpt-4.1-mini";

function normalizeRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function extractResponseText(responseJson: unknown) {
  const response = normalizeRecord(responseJson);
  if (!response) {
    return "";
  }

  if (
    typeof response.output_text === "string" &&
    response.output_text.trim().length > 0
  ) {
    return response.output_text.trim();
  }

  const output = Array.isArray(response.output) ? response.output : [];
  const parts: string[] = [];

  for (const item of output) {
    const entry = normalizeRecord(item);

    if (typeof entry?.arguments === "string" && entry.arguments.trim()) {
      parts.push(entry.arguments.trim());
    }

    const content = Array.isArray(entry?.content) ? entry.content : [];
    for (const contentItem of content) {
      const contentEntry = normalizeRecord(contentItem);
      const text =
        typeof contentEntry?.text === "string"
          ? contentEntry.text
          : typeof contentEntry?.value === "string"
            ? contentEntry.value
            : "";

      if (text.trim()) {
        parts.push(text.trim());
      }
    }
  }

  return parts.join("\n").trim();
}

function getApiKey() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY_MISSING");
  }

  return apiKey;
}

function resolveImageMimeType(imagePath: string) {
  const extension = path.extname(imagePath).toLowerCase();

  if (extension === ".png") {
    return "image/png";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  return "image/jpeg";
}

async function createResponse(input: {
  instructions: string;
  content: Array<Record<string, unknown>>;
  operation: string;
}) {
  console.info(`${processingLogPrefix} openai request started`, {
    operation: input.operation,
    model: defaultProcessingModel,
  });

  const response = await fetch(responsesUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: defaultProcessingModel,
      temperature: 0.2,
      instructions: input.instructions,
      input: [
        {
          role: "user",
          content: input.content,
        },
      ],
    }),
  });

  const json = (await response.json().catch(() => null)) as
    | {
        output_text?: string;
        output?: unknown[];
        error?: { message?: string };
      }
    | null;

  if (!response.ok) {
    throw new Error(
      json?.error?.message ||
        `OpenAI request failed with status ${response.status}.`,
    );
  }

  const contentText = extractResponseText(json);

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

  const repairedText = await createResponse({
    operation: `${repairContext}:repair`,
    instructions:
      "Repair the supplied JSON so it strictly matches the requested schema. Return JSON only with no prose.",
    content: [
      {
        type: "input_text",
        text: [
          `Schema target: ${repairContext}`,
          "Original response:",
          responseText,
          "Validation issues:",
          JSON.stringify(firstPass.error.flatten(), null, 2),
        ].join("\n\n"),
      },
    ],
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
  const responseText = await createResponse({
    operation: input.schemaName,
    instructions: `${input.systemPrompt} Return valid JSON only.`,
    content: [
      {
        type: "input_text",
        text: input.userText,
      },
    ],
  });

  return parseJsonWithRepair(input.schema, responseText, input.schemaName);
}

async function requestStructuredJsonWithImages<S extends ZodTypeAny>(input: {
  schema: S;
  schemaName: string;
  systemPrompt: string;
  userText: string;
  imagePaths: string[];
}): Promise<z.output<S>> {
  const imageContent = await Promise.all(
    input.imagePaths.map(async (imagePath) => {
      const bytes = await readFile(imagePath);
      return {
        type: "input_image",
        image_url: `data:${resolveImageMimeType(imagePath)};base64,${bytes.toString("base64")}`,
      };
    }),
  );

  const responseText = await createResponse({
    operation: input.schemaName,
    instructions: `${input.systemPrompt} Return valid JSON only.`,
    content: [
      {
        type: "input_text",
        text: input.userText,
      },
      ...imageContent,
    ],
  });

  return parseJsonWithRepair(input.schema, responseText, input.schemaName);
}

export async function buildGroundedSourceSummary(input: {
  selectedText: string;
  userComment?: string | null;
  transcriptText?: string | null;
  extractedText?: string | null;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  authors?: string[];
  abstract?: string | null;
  publicationDate?: string | null;
}): Promise<GroundedSourceSummary> {
  return requestStructuredJson({
    schema: groundedSourceSummarySchema,
    schemaName: "GroundedSourceSummary",
    systemPrompt: [
      "You build a grounded summary for a captured research note.",
      "Do not invent bibliographic facts or metadata.",
      "Use the provided source fields as canonical metadata context.",
      "Use extracted text, selected text, user commentary, and transcript to explain what matters about this capture.",
      "Return JSON only with keys: summary, model.",
      'Use exactly this JSON shape: {"summary":"string or empty string","model":"string"}.',
      "summary should be concise, evidence-grounded, and useful for downstream note knowledge.",
    ].join(" "),
    userText: [
      `Source title: ${input.sourceTitle || "Unknown"}`,
      `Source URL: ${input.sourceUrl || "Unknown"}`,
      `Authors: ${JSON.stringify(input.authors || [])}`,
      `Publication date: ${input.publicationDate || "Unknown"}`,
      `Source abstract: ${input.abstract || "Unknown"}`,
      `Extracted text: ${input.extractedText || "None"}`,
      `Selected text: ${input.selectedText || "N/A"}`,
      `User comment: ${input.userComment || "None"}`,
      `Transcript text: ${input.transcriptText || "None"}`,
      `Set model to "${defaultProcessingModel}".`,
    ].join("\n\n"),
  });
}

export async function extractStructuredSourceFieldsFromText(input: {
  pageTitle?: string | null;
  pageUrl?: string | null;
  selectedText?: string | null;
  extractedText: string;
}): Promise<ScreenshotFieldExtraction> {
  return requestStructuredJson({
    schema: screenshotFieldExtractionSchema,
    schemaName: "StructuredSourceFieldsFromText",
    systemPrompt: [
      "You extract only explicitly present source fields from OCR or extracted document text.",
      "Do not invent, infer, or summarize beyond the evidence shown.",
      "Use the extracted text as the primary source of truth.",
      "If a field is not clearly present, return null or an empty array.",
      "authors must be an array of strings.",
      "publicationDate must be null unless an explicit date is present in the extracted text.",
      "Return JSON only with keys: selectedText, title, url, authors, abstract, publicationDate, model.",
      'Use exactly this JSON shape: {"selectedText":"string|null","title":"string|null","url":"string|null","authors":[],"abstract":"string|null","publicationDate":"string|null","model":"string"}.',
    ].join(" "),
    userText: [
      `Page title: ${input.pageTitle || "Unknown"}`,
      `Page URL: ${input.pageUrl || "Unknown"}`,
      `Existing selected text: ${input.selectedText || "None"}`,
      "Extract explicit source fields from the extracted text only.",
      "Extracted text:",
      input.extractedText || "None",
      `Set model to "${defaultProcessingModel}".`,
    ].join("\n"),
  });
}

export async function extractClickyScreenshotDetailsFromImages(input: {
  pageTitle?: string | null;
  pageUrl?: string | null;
  selectedText?: string | null;
  imagePaths: string[];
}): Promise<ClickyScreenshotExtraction> {
  return requestStructuredJsonWithImages({
    schema: clickyScreenshotExtractionSchema,
    schemaName: "ClickyScreenshotExtraction",
    systemPrompt: [
      "You extract grounded source fields from screenshot images.",
      "Use the images as the primary source of truth.",
      "Do not invent fields that are not visible.",
      "The screenshot images outweigh page hints or prefilled text whenever they conflict.",
      "Look for selectedText as visibly highlighted or selected text, including blue selection highlights, selected PDF text, browser selection styling, or other obvious text-selection states.",
      "A title may appear as the paper heading, article heading, PDF document title, tab title, or large title text near the top of the visible document.",
      "A url may appear in the browser address bar, PDF viewer address field, or as an explicitly visible canonical link.",
      "Authors may appear as a byline, author list, or names directly below the title.",
      "An abstract may appear under a heading like Abstract or Summary.",
      "A publicationDate may appear as a year, full date, journal metadata line, conference metadata line, or publication label.",
      "If no reliable title is visible, generate a short grounded title from the visible image contents.",
      "Return JSON only with keys: extractedText, selectedText, title, url, authors, abstract, publicationDate, model.",
      'Use exactly this JSON shape: {"extractedText":"string","selectedText":"string|null","title":"string","url":"string|null","authors":[],"abstract":"string|null","publicationDate":"string|null","model":"string"}.',
      "extractedText should contain the most useful visible text transcribed from the image.",
      "If a field is not visible, return null for url and publicationDate, [] for authors, and an empty string for the remaining string fields.",
      "Do not copy placeholder values like Unknown, None, or N/A unless they are literally visible in the screenshot.",
    ].join(" "),
    userText: [
      `Page title: ${input.pageTitle || "Unknown"}`,
      `Page URL: ${input.pageUrl || "Unknown"}`,
      `Existing selected text: ${input.selectedText || "None"}`,
      "Extract visible text and fields only if they are present in the images.",
      "Use the page hints only as secondary context.",
      `Set model to "${defaultProcessingModel}".`,
    ].join("\n"),
    imagePaths: input.imagePaths,
  });
}

export async function buildNoteKnowledge(input: {
  selectedText: string;
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
      'Use exactly this JSON shape: {"keyFindings":"string","userView":"string","conclusion":"string","model":"string"}.',
      `Set model to "${defaultProcessingModel}".`,
    ].join(" "),
    userText: [
      `Source title: ${input.sourceTitle || "Unknown"}`,
      `Source URL: ${input.sourceUrl || "Unknown"}`,
      `Authors: ${JSON.stringify(input.authors || [])}`,
      `Publication date: ${input.publicationDate || "Unknown"}`,
      `Source abstract: ${input.sourceAbstract || "Unknown"}`,
      `Source summary: ${input.sourceSummary || "Unknown"}`,
      `Selected text: ${input.selectedText || "N/A"}`,
      `User comment: ${input.userComment || "None"}`,
      `Screenshot context: ${input.screenshotImportantText || "None"}`,
      `Transcript text: ${input.transcriptText || "None"}`,
    ].join("\n\n"),
  });
}

export function getProcessingModel() {
  return defaultProcessingModel;
}
