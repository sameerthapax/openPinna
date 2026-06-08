import type { NoteFormValues } from "@/lib/validations/note";
import type { StructuredNoteDraft } from "@/lib/types";

// Future AI work: replace this deterministic placeholder with a service that
// structures raw notes using source context, selected text, and user intent.
export async function structureResearchNote(
  note: NoteFormValues,
): Promise<StructuredNoteDraft> {
  const selectedTextHint = note.userCommentary
    ? "Includes user commentary for later grounding."
    : "No user commentary captured yet.";

  return {
    structuredSummary: `Placeholder summary for "${note.selectedText.slice(0, 80)}". ${selectedTextHint}`,
    usefulness:
      "Placeholder usefulness: identify whether this note supports, challenges, or extends the current research question.",
    purpose:
      "Placeholder purpose: preserve the user's raw thought until AI synthesis is enabled.",
  };
}
