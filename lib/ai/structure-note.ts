import type { NoteFormValues } from "@/lib/validations/note";
import type { StructuredNoteDraft } from "@/lib/types";

// Future AI work: replace this deterministic placeholder with a service that
// structures raw notes using source context, selected text, and user intent.
export async function structureResearchNote(
  note: NoteFormValues,
): Promise<StructuredNoteDraft> {
  const sourceContext = note.sourceTitle || note.sourceUrl;
  const selectedTextHint = note.selectedText
    ? "Includes source selection for later grounding."
    : "No selected text captured yet.";

  return {
    structuredSummary: `Placeholder summary for "${note.title}" from ${sourceContext}. ${selectedTextHint}`,
    usefulness:
      "Placeholder usefulness: identify whether this note supports, challenges, or extends the current research question.",
    purpose:
      "Placeholder purpose: preserve the user's raw thought until AI synthesis is enabled.",
  };
}
