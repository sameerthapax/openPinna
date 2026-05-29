import type { ResearchNote } from "@prisma/client";
import { db } from "@/lib/db";
import { structureResearchNote } from "@/lib/ai/structure-note";

type NoteInput = {
  title: string;
  sourceUrl: string;
  sourceTitle?: string | null;
  selectedText?: string | null;
  rawThought: string;
  tags?: string[] | string;
};

type NoteUpdateInput = Partial<Omit<NoteInput, "tags">> & {
  tags?: string[] | string;
};

function normalizeTags(tags?: string[] | string) {
  if (!tags) {
    return [];
  }

  const values = Array.isArray(tags) ? tags : tags.split(",");

  return values
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeNoteInput(input: NoteInput) {
  return {
    title: input.title.trim(),
    sourceUrl: input.sourceUrl.trim(),
    sourceTitle: input.sourceTitle?.trim() || null,
    selectedText: input.selectedText?.trim() || null,
    rawThought: input.rawThought.trim(),
    tags: normalizeTags(input.tags),
  };
}

function applyPatch(current: ResearchNote, input: NoteUpdateInput) {
  return {
    title: input.title?.trim() ?? current.title,
    sourceUrl: input.sourceUrl?.trim() ?? current.sourceUrl,
    sourceTitle:
      input.sourceTitle === undefined
        ? current.sourceTitle
        : input.sourceTitle?.trim() || null,
    selectedText:
      input.selectedText === undefined
        ? current.selectedText
        : input.selectedText?.trim() || null,
    rawThought: input.rawThought?.trim() ?? current.rawThought,
    tags: input.tags ? normalizeTags(input.tags) : current.tags,
  };
}

export async function listNotes() {
  return db.researchNote.findMany({
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getNoteById(id: string) {
  return db.researchNote.findUnique({
    where: { id },
  });
}

export async function createNote(input: NoteInput) {
  const normalized = normalizeNoteInput(input);
  const structured = await structureResearchNote({
    title: normalized.title,
    sourceUrl: normalized.sourceUrl,
    sourceTitle: normalized.sourceTitle ?? "",
    selectedText: normalized.selectedText ?? "",
    rawThought: normalized.rawThought,
    tags: normalized.tags.join(", "),
  });

  return db.researchNote.create({
    data: {
      ...normalized,
      structuredSummary: structured.structuredSummary,
      usefulness: structured.usefulness,
      purpose: structured.purpose,
    },
  });
}

export async function updateNote(id: string, input: NoteUpdateInput) {
  const existing = await getNoteById(id);

  if (!existing) {
    return null;
  }

  const next = applyPatch(existing, input);

  return db.researchNote.update({
    where: { id },
    data: next,
  });
}

export async function deleteNote(id: string) {
  const existing = await getNoteById(id);

  if (!existing) {
    return null;
  }

  await db.researchNote.delete({
    where: { id },
  });

  return existing;
}
