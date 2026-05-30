import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { NotePinnaBoard } from "@/components/notes/NotePinnaBoard";

export default async function NoteResearchPage({ params }: { params: Promise<{ projectId: string; sessionId: string; noteId: string }> }) {
  const { projectId, sessionId, noteId } = await params;

  const note = await db.note.findUnique({
    where: { id: noteId },
    include: {
      session: { include: { project: true } },
      chatThreads: { include: { messages: { orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "asc" } },
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

        <NotePinnaBoard
          centralIdea={note.noteText}
          initialThreads={note.chatThreads.map((thread) => ({
            id: thread.id,
            question: thread.threadType,
            title: thread.title,
            messages: thread.messages.map((message) => ({
              id: message.id,
              role: message.role,
              content: message.content,
            })),
          }))}
        />
      </section>
    </div>
  );
}
