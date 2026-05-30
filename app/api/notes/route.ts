import { listAllNotes } from "@/app/api/_lib/services/note.service";
import { jsonOk } from "@/app/api/_lib/http";

export async function GET() {
  const notes = await listAllNotes();

  const normalized = notes.map((note) => ({
    id: note.id,
    title: note.noteText.slice(0, 80),
    sourceUrl: "",
    sourceTitle: null,
    selectedText: note.userCommentary,
    rawThought: note.noteText,
    structuredSummary: note.noteSummary,
    usefulness: null,
    purpose: null,
    tags: [],
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  }));

  return jsonOk({ notes: normalized });
}
