import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { NotePinnaBoard } from "@/components/notes/NotePinnaBoard";

export default async function NoteResearchPage({ params }: { params: Promise<{ projectId: string; sessionId: string; noteId: string }> }) {
  const { projectId, sessionId, noteId } = await params;

  const note = await db.note.findUnique({
    where: { id: noteId },
    include: {
      session: { include: { project: true } },
      chatThreads: {
        include: { messages: { orderBy: { createdAt: "asc" } }, pinnaTemplate: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!note || note.sessionId !== sessionId || note.session.projectId !== projectId) notFound();
  const noteTitle = note.noteText.slice(0, 72);
  const sessionDateLabel = new Date(note.session.sessionKey).toLocaleDateString();

  return (
    <div className="space-y-6 pb-16">
      <section className="border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8">
        <div className="space-y-3 border-b border-[var(--border)] pb-7">
          <p className="font-mono-ui text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Note research board</p>
          <h1 className="font-editorial text-5xl tracking-[-0.04em]">{note.session.project.title}</h1>
          <p className="text-xl text-[var(--muted-foreground)]">Session: {sessionDateLabel} · Note: {noteTitle}</p>
          <p className="max-w-[72ch] text-sm leading-7 text-[var(--muted-foreground)]">{note.noteText}</p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
          <NotePinnaBoard
            centralIdea={note.noteText}
            initialThreads={note.chatThreads.map((thread) => ({
              id: thread.id,
              question: thread.title || thread.pinnaTemplate?.defaultTitle || thread.threadType,
              title: thread.title,
              messages: thread.messages.map((message) => ({
                id: message.id,
                role: message.role,
                content: message.content,
              })),
            }))}
          />

          <aside className="border border-[var(--border)] bg-[var(--surface)] p-5">
            <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Knowledge build</p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em]">Note-level synthesis (mock)</h2>

            <div className="mt-4 space-y-4 text-sm leading-7 text-[var(--muted-foreground)]">
              <p>
                <span className="text-[var(--foreground)]">Base note:</span>{" "}
                {note.noteText.slice(0, 220)}
                {note.noteText.length > 220 ? "..." : ""}
              </p>
              <p>
                <span className="text-[var(--foreground)]">Active pinnas:</span>{" "}
                {note.chatThreads.length}
              </p>
              <p>
                <span className="text-[var(--foreground)]">Mock merged summary:</span>{" "}
                This note captures a central claim that now has multiple pinna
                explorations. The current direction suggests validating evidence,
                capturing one practical application path, and preserving one
                counterpoint before promoting to session summary.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
