import { createCapture } from "@/app/api/_lib/services/capture.service";
import { createNote } from "@/app/api/_lib/services/note.service";
import { listProjects } from "@/app/api/_lib/services/project.service";
import { getOrCreateTodaySession } from "@/app/api/_lib/services/session.service";
import { createSourceFromUrl } from "@/app/api/_lib/services/source.service";

type ScreenshotInput = {
  file: File;
  fileName?: string | null;
  mimeType?: string | null;
  label?: string | null;
};

export type ResearchCaptureOrigin = "clicky" | "extension" | "macos-desktop";

export type ResearchNoteDecision = {
  taskType: "add_note_to_project";
  projectName: string | null;
  taskSummary: string;
  userCommentary: string;
  sessionHint?: string | null;
};

export type PersistResearchNoteInput = {
  mode: "normal" | "research";
  transcript: string;
  userPrompt?: string | null;
  pageUrl?: string | null;
  pageTitle?: string | null;
  selectedText?: string | null;
  sourceMetadata?: Record<string, unknown> | null;
  screenshots?: ScreenshotInput[];
  captureOrigin?: ResearchCaptureOrigin | null;
  projectId?: string | null;
  decision: ResearchNoteDecision;
};

export type PersistedResearchResult = {
  projectId: string;
  projectTitle: string;
  sessionId: string;
  sessionTitle: string | null;
  sourceId: string | null;
  captureId: string | null;
  noteId: string;
  confirmationText: string;
  captureOrigin: ResearchCaptureOrigin;
};

const placeholderTitles = new Set([
  "research capture",
  "research screenshot",
  "unknown",
  "none",
]);

function normalizeProjectKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toWords(value: string) {
  return normalizeProjectKey(value)
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);
}

function scoreProjectTitle(candidate: string, query: string) {
  const normalizedCandidate = normalizeProjectKey(candidate);
  const normalizedQuery = normalizeProjectKey(query);

  if (!normalizedCandidate || !normalizedQuery) {
    return 0;
  }

  if (normalizedCandidate === normalizedQuery) {
    return 1;
  }

  if (
    normalizedCandidate.includes(normalizedQuery) ||
    normalizedQuery.includes(normalizedCandidate)
  ) {
    return 0.92;
  }

  const candidateWords = new Set(toWords(candidate));
  const queryWords = toWords(query);

  if (candidateWords.size === 0 || queryWords.length === 0) {
    return 0;
  }

  let overlap = 0;
  for (const word of queryWords) {
    if (candidateWords.has(word)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(queryWords.length, candidateWords.size);
}

async function resolveTargetProject(input: {
  explicitProjectId?: string | null;
  projectName?: string | null;
}) {
  const projects = await listProjects();

  if (projects.length === 0) {
    throw new Error("RESEARCH_PROJECT_NOT_FOUND");
  }

  if (input.explicitProjectId) {
    const explicit = projects.find(
      (project) => project.id === input.explicitProjectId,
    );
    if (!explicit) {
      throw new Error("RESEARCH_PROJECT_NOT_FOUND");
    }

    return explicit;
  }

  const requestedName = input.projectName?.trim();
  if (!requestedName) {
    throw new Error("RESEARCH_PROJECT_NAME_REQUIRED");
  }

  const ranked = projects
    .map((project) => ({
      project,
      score: scoreProjectTitle(project.title, requestedName),
    }))
    .sort((left, right) => right.score - left.score);

  const bestMatch = ranked[0];

  if (!bestMatch || bestMatch.score < 0.55) {
    throw new Error("RESEARCH_PROJECT_NOT_FOUND");
  }

  return bestMatch.project;
}

function resolveCaptureOrigin(
  sourceMetadata?: Record<string, unknown> | null,
  captureOrigin?: ResearchCaptureOrigin | null,
): ResearchCaptureOrigin {
  if (captureOrigin) {
    return captureOrigin;
  }

  const rawOrigin =
    typeof sourceMetadata?.captureOrigin === "string"
      ? sourceMetadata.captureOrigin.trim()
      : "";
  if (
    rawOrigin === "clicky" ||
    rawOrigin === "extension" ||
    rawOrigin === "macos-desktop"
  ) {
    return rawOrigin;
  }

  return "macos-desktop";
}

function cleanMeaningfulTitle(value: string | null | undefined) {
  const trimmed = value?.trim() || "";
  if (!trimmed) {
    return null;
  }

  return placeholderTitles.has(trimmed.toLowerCase()) ? null : trimmed;
}

function buildSelectedText(input: PersistResearchNoteInput) {
  const selectedText = input.selectedText?.trim();
  if (selectedText) {
    return selectedText;
  }

  return "N/A";
}

function buildConfirmationText(input: {
  projectTitle: string;
  sessionTitle: string | null;
  sessionDate: string;
}) {
  const sessionLabel =
    input.sessionTitle?.trim() || `Session ${input.sessionDate}`;
  return `This note was added to ${input.projectTitle} under ${sessionLabel}.`;
}

export async function persistResearchNote(
  input: PersistResearchNoteInput,
): Promise<PersistedResearchResult> {
  const project = await resolveTargetProject({
    explicitProjectId: input.projectId,
    projectName: input.decision.projectName,
  });
  const captureOrigin = resolveCaptureOrigin(
    input.sourceMetadata,
    input.captureOrigin,
  );
  const { session } = await getOrCreateTodaySession(project.id);
  const sourceMetadata = input.sourceMetadata || {};
  const source = await createSourceFromUrl(project.id, session.id, {
    sourceType:
      typeof sourceMetadata.sourceType === "string"
        ? sourceMetadata.sourceType
        : "web",
    title: cleanMeaningfulTitle(
      (typeof sourceMetadata.title === "string" ? sourceMetadata.title : "") ||
        input.pageTitle ||
        null,
    ),
    abstract:
      typeof sourceMetadata.abstract === "string"
        ? sourceMetadata.abstract
        : null,
    authors: Array.isArray(sourceMetadata.authors)
      ? sourceMetadata.authors.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [],
    publicationYear:
      typeof sourceMetadata.publicationYear === "number"
        ? sourceMetadata.publicationYear
        : null,
    venue:
      typeof sourceMetadata.venue === "string" ? sourceMetadata.venue : null,
    doi: typeof sourceMetadata.doi === "string" ? sourceMetadata.doi : null,
    url:
      (typeof sourceMetadata.url === "string" ? sourceMetadata.url : "") ||
      input.pageUrl ||
      null,
    pdfUrl:
      typeof sourceMetadata.pdfUrl === "string" ? sourceMetadata.pdfUrl : null,
    metadata: {
      ...sourceMetadata,
      researchIngest: {
        mode: input.mode,
        captureOrigin,
        pageUrl: input.pageUrl || null,
        pageTitle: input.pageTitle || null,
        sessionHint: input.decision.sessionHint || null,
        taskType: input.decision.taskType,
        taskSummary: input.decision.taskSummary,
      },
    },
  });

  let captureId: string | null = null;
  const firstScreenshot = input.screenshots?.[0];

  if (firstScreenshot) {
    const capture = await createCapture({
      sourceId: source.id,
      sessionId: session.id,
      artifactFile: firstScreenshot.file,
      artifactType: "screenshot",
      captureMode: "page-screenshot",
      mimeType: firstScreenshot.mimeType || null,
      originalUrl: input.pageUrl || null,
      title:
        cleanMeaningfulTitle(input.pageTitle) ||
        cleanMeaningfulTitle(source.title) ||
        "Research screenshot",
      fileName: firstScreenshot.fileName || "screen.jpg",
      source: captureOrigin,
      selectedText: input.selectedText || null,
      caption: firstScreenshot.label || null,
    });
    captureId = capture.id;
  }

  const note = await createNote({
    projectId: project.id,
    sessionId: session.id,
    sourceId: source.id,
    captureId,
    selectedText: buildSelectedText(input),
    userCommentary: input.decision.userCommentary.trim(),
  });

  return {
    projectId: project.id,
    projectTitle: project.title,
    sessionId: session.id,
    sessionTitle: session.title || null,
    sourceId: source.id,
    captureId,
    noteId: note.id,
    confirmationText: buildConfirmationText({
      projectTitle: project.title,
      sessionTitle: session.title || null,
      sessionDate: session.sessionKey.toISOString().slice(0, 10),
    }),
    captureOrigin,
  };
}
