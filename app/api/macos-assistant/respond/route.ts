import { z } from "zod";
import { jsonError, jsonOk } from "@/app/api/_lib/http";
import { respondToMacosAssistant } from "@/app/api/_lib/services/macos-assistant.service";

const schema = z.object({
  mode: z.enum(["normal", "research"]).default("normal"),
  requestKind: z
    .enum(["assistant_reply", "pointing_coordinate", "pointing_verify"])
    .default("assistant_reply"),
  transcript: z.string().trim().min(1, "transcript is required."),
  userPrompt: z.string().trim().optional(),
  pageUrl: z.string().trim().optional(),
  pageTitle: z.string().trim().optional(),
  selectedText: z.string().trim().optional(),
  projectId: z.string().trim().optional(),
  captureOrigin: z.enum(["clicky", "extension", "macos-desktop"]).optional(),
  sourceMetadata: z.string().trim().optional(),
  conversationHistory: z.string().trim().optional(),
  screenshotMeta: z.string().trim().optional(),
});

function optionalStringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as {
      mode?: string;
      requestKind?: string;
      transcript?: string;
      userPrompt?: string;
      pageUrl?: string;
      pageTitle?: string;
      selectedText?: string;
      projectId?: string;
      captureOrigin?: string;
      sourceMetadata?: unknown;
      conversationHistory?: unknown;
      screenshots?: Array<{
        filename?: string;
        mimeType?: string;
        base64Data?: string;
        label?: string;
        isCursorScreen?: boolean;
        displayIndex?: number;
      }>;
    } | null;

    const parsed = schema.safeParse({
      mode: optionalStringValue(body?.mode),
      requestKind: optionalStringValue(body?.requestKind),
      transcript: optionalStringValue(body?.transcript),
      userPrompt: optionalStringValue(body?.userPrompt),
      pageUrl: optionalStringValue(body?.pageUrl),
      pageTitle: optionalStringValue(body?.pageTitle),
      selectedText: optionalStringValue(body?.selectedText),
      projectId: optionalStringValue(body?.projectId),
      captureOrigin: optionalStringValue(body?.captureOrigin),
    });

    if (!parsed.success) {
      return jsonError(
        parsed.error.issues[0]?.message || "Invalid assistant request.",
        400,
      );
    }

    try {
      const screenshots = (body?.screenshots || []).flatMap(
        (screenshot, index) => {
          if (!screenshot?.base64Data) {
            return [];
          }

          try {
            const bytes = Buffer.from(screenshot.base64Data, "base64");
            const file = new File(
              [bytes],
              screenshot.filename?.trim() || `screen-${index}.jpg`,
              { type: screenshot.mimeType?.trim() || "image/jpeg" },
            );

            return [
              {
                file,
                mimeType: screenshot.mimeType || file.type,
                label: screenshot.label || null,
                isCursorScreen: screenshot.isCursorScreen === true,
                displayIndex:
                  typeof screenshot.displayIndex === "number"
                    ? screenshot.displayIndex
                    : null,
              },
            ];
          } catch {
            return [];
          }
        },
      );

      const result = await respondToMacosAssistant({
        mode: parsed.data.mode,
        requestKind: parsed.data.requestKind,
        transcript: parsed.data.transcript,
        userPrompt: parsed.data.userPrompt,
        pageUrl: parsed.data.pageUrl,
        pageTitle: parsed.data.pageTitle,
        selectedText: parsed.data.selectedText,
        projectId: parsed.data.projectId,
        captureOrigin: parsed.data.captureOrigin,
        sourceMetadata:
          body?.sourceMetadata &&
          typeof body.sourceMetadata === "object" &&
          !Array.isArray(body.sourceMetadata)
            ? (body.sourceMetadata as Record<string, unknown>)
            : null,
        conversationHistory: Array.isArray(body?.conversationHistory)
          ? body.conversationHistory
          : [],
        screenshots,
      });

      return jsonOk(result);
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "Assistant request failed.",
        500,
      );
    }
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return jsonError("Invalid assistant request.", 400);
  }

  const parsed = schema.safeParse({
    mode: formData.get("mode")?.toString(),
    requestKind: formData.get("requestKind")?.toString(),
    transcript: formData.get("transcript")?.toString(),
    userPrompt: formData.get("userPrompt")?.toString(),
    pageUrl: formData.get("pageUrl")?.toString(),
    pageTitle: formData.get("pageTitle")?.toString(),
    selectedText: formData.get("selectedText")?.toString(),
    projectId: formData.get("projectId")?.toString(),
    captureOrigin: formData.get("captureOrigin")?.toString(),
    sourceMetadata: formData.get("sourceMetadata")?.toString(),
    conversationHistory: formData.get("conversationHistory")?.toString(),
    screenshotMeta: formData.get("screenshotMeta")?.toString(),
  });

  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message || "Invalid assistant request.",
      400,
    );
  }

  const screenshotFiles = formData
    .getAll("screenshots")
    .filter((entry): entry is File => entry instanceof File);

  const screenshotMeta = (() => {
    try {
      const parsedJson = JSON.parse(parsed.data.screenshotMeta || "[]");
      return Array.isArray(parsedJson) ? parsedJson : [];
    } catch {
      return [];
    }
  })();

  const sourceMetadata = (() => {
    try {
      return parsed.data.sourceMetadata
        ? JSON.parse(parsed.data.sourceMetadata)
        : null;
    } catch {
      return null;
    }
  })();

  const conversationHistory = (() => {
    try {
      return parsed.data.conversationHistory
        ? JSON.parse(parsed.data.conversationHistory)
        : [];
    } catch {
      return [];
    }
  })();

  try {
    const result = await respondToMacosAssistant({
      mode: parsed.data.mode,
      requestKind: parsed.data.requestKind,
      transcript: parsed.data.transcript,
      userPrompt: parsed.data.userPrompt,
      pageUrl: parsed.data.pageUrl,
      pageTitle: parsed.data.pageTitle,
      selectedText: parsed.data.selectedText,
      projectId: parsed.data.projectId,
      captureOrigin: parsed.data.captureOrigin,
      sourceMetadata:
        sourceMetadata &&
        typeof sourceMetadata === "object" &&
        !Array.isArray(sourceMetadata)
          ? (sourceMetadata as Record<string, unknown>)
          : null,
      conversationHistory,
      screenshots: screenshotFiles.map((file, index) => {
        const meta =
          screenshotMeta[index] && typeof screenshotMeta[index] === "object"
            ? (screenshotMeta[index] as Record<string, unknown>)
            : {};

        return {
          file,
          mimeType: file.type || null,
          label: typeof meta.label === "string" ? meta.label : null,
          isCursorScreen: meta.isCursorScreen === true,
          displayIndex:
            typeof meta.displayIndex === "number" ? meta.displayIndex : null,
        };
      }),
    });

    return jsonOk(result);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Assistant request failed.",
      500,
    );
  }
}
