import type { ResearchNote } from "@prisma/client";

export type ResearchNoteRecord = ResearchNote;

export type StructuredNoteDraft = {
  structuredSummary: string;
  usefulness: string;
  purpose: string;
};
