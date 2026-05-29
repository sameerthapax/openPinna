import Link from "next/link";
import { PlusIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/Button";
import { NoteCard } from "@/components/notes/NoteCard";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const notes = await db.researchNote.findMany({
    orderBy: {
      createdAt: "desc",
    },
  });

  return (
    <div className="space-y-10 pb-16">
      <div className="reveal grid gap-6 border-b border-[var(--border)] pb-8 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <div className="inline-flex rounded-[999px] bg-[var(--pastel-blue)] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--pastel-blue-text)]">
            Manual capture
          </div>
          <h1 className="font-editorial mt-5 text-5xl font-semibold tracking-[-0.045em] md:text-6xl">
            Research notes
          </h1>
          <p className="mt-4 max-w-[60ch] text-base leading-8 text-[var(--muted-foreground)]">
            Manual capture for source-backed ideas and reading notes.
          </p>
        </div>
        <Button asChild>
          <Link href="/notes/new">
            <PlusIcon className="h-4 w-4" />
            New note
          </Link>
        </Button>
      </div>

      {notes.length > 0 ? (
        <div className="grid gap-4">
          {notes.map((note, index) => (
            <NoteCard key={note.id} note={note} index={index} />
          ))}
        </div>
      ) : (
        <div className="reveal border border-dashed border-[var(--border)] bg-white p-10 md:p-14">
          <div className="max-w-xl">
            <p className="font-mono-ui text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              Empty archive
            </p>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.03em]">
              No notes yet
            </h2>
            <p className="mt-3 text-sm leading-7 text-[var(--muted-foreground)]">
              Create the first note from a paper, article, or research idea.
              Browser extension capture will build on this same model later.
            </p>
            <div className="mt-6">
              <Button asChild>
                <Link href="/notes/new">Create first note</Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
