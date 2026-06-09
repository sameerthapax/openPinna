import { getOpenAIClient } from "@/src/agents/openai/openai-client";

export type ClaimKnowledgeVersionContext = {
  version: number;
  title?: string | null;
  summary?: string | null;
  keyFindings?: string | null;
  userView?: string | null;
  conclusion?: string | null;
};

export type ClaimExtractionInput = {
  selectedText: string;
  sourceTitle?: string | null;
  baseKnowledgeVersion?: ClaimKnowledgeVersionContext | null;
};

export type ClaimRewriteInput = {
  oldClaim: string;
  selectedText: string;
  additionalContext: string;
};

export type ClaimExtractionResult = {
  claim: string;
  evidence: string;
  uncertainty: string;
};

export type ClaimRewriteResult = {
  rewrittenClaim: string;
  reasoning: string;
  uncertainty: string;
};

function textSnippet(value: string, max = 4000) {
  return value.trim().slice(0, max);
}

function parseResponseText(raw: string) {
  if (!raw.trim()) {
    return null;
  }

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
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

function buildBaseKnowledgeContext(baseKnowledgeVersion?: ClaimKnowledgeVersionContext | null) {
  if (!baseKnowledgeVersion) return null;

  return [
    `Base knowledge build v${baseKnowledgeVersion.version}${baseKnowledgeVersion.title ? `: ${baseKnowledgeVersion.title}` : ""}`,
    baseKnowledgeVersion.summary ? `Summary:\n${baseKnowledgeVersion.summary}` : null,
    baseKnowledgeVersion.keyFindings ? `Key findings:\n${baseKnowledgeVersion.keyFindings}` : null,
    baseKnowledgeVersion.userView ? `User view:\n${baseKnowledgeVersion.userView}` : null,
    baseKnowledgeVersion.conclusion ? `Conclusion:\n${baseKnowledgeVersion.conclusion}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function normalizeClaim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function extractClaimFromSelectedText(input: ClaimExtractionInput): Promise<ClaimExtractionResult> {
  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    instructions:
      "You extract one precise research claim from note context. Return JSON only with keys claim, evidence, and uncertainty. Stay grounded in the selected text and base knowledge. Do not invent a broader claim than the text supports.",
    input: [
      {
        role: "user",
        content: [
          "Return valid JSON only.",
          `Selected text:\n${textSnippet(input.selectedText, 6000)}`,
          input.sourceTitle ? `Source title: ${input.sourceTitle}` : null,
          buildBaseKnowledgeContext(input.baseKnowledgeVersion),
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    text: {
      format: {
        type: "json_object",
      },
    },
    store: true,
  });
  const raw = getResponseText(response);
  const parsed = parseResponseText(raw);
  const claim = normalizeClaim(parsed?.claim ?? parsed?.rewrittenClaim ?? parsed?.reply);
  const evidence = normalizeClaim(parsed?.evidence);
  const uncertainty = normalizeClaim(parsed?.uncertainty);

  if (!claim) {
    throw new Error("Claim extraction returned an empty claim.");
  }

  return {
    claim,
    evidence,
    uncertainty,
  };
}

export async function rewriteClaimPrecisely(
    input: ClaimRewriteInput,
): Promise<ClaimRewriteResult> {
  const client = getOpenAIClient();

  try {
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      instructions:
          "You are a research assistant refining an existing claim. Return valid JSON only with keys rewrittenClaim, reasoning, and uncertainty. Keep the old claim unless the selected text or additional context clearly supports a revision. Be direct when the claim is wrong, incomplete, or too broad.",
      input: [
        {
          role: "user",
          content: [
            "Return valid JSON only.",
            `Old claim:\n${textSnippet(input.oldClaim, 4000)}`,
            `Selected text:\n${textSnippet(input.selectedText, 6000)}`,
            `Additional context:\n${textSnippet(input.additionalContext, 6000)}`,
          ]
              .filter(Boolean)
              .join("\n\n"),
        },
      ],
      text: {
        format: {
          type: "json_object",
        },
      },
      store: true,
    });

    const raw = getResponseText(response);
    const parsed = parseResponseText(raw);
    const rewrittenClaim = normalizeClaim(parsed?.rewrittenClaim ?? parsed?.claim ?? parsed?.reply);
    const reasoning = normalizeClaim(parsed?.reasoning);
    const uncertainty = normalizeClaim(parsed?.uncertainty);

    if (!rewrittenClaim) {
      throw new Error("Claim rewrite returned an empty claim.");
    }

    return {
      rewrittenClaim,
      reasoning,
      uncertainty,
    };
  } catch (error) {
    console.error("[REWRITE_CLAIM_OPENAI_ERROR]", error);
    throw error;
  }
}
