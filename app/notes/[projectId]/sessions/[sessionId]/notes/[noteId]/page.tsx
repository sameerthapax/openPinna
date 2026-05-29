import { notFound } from "next/navigation";
import { db } from "@/lib/db";

export default async function NoteResearchPage({ params }: { params: Promise<{ projectId: string; sessionId: string; noteId: string }> }) {
  const { projectId, sessionId, noteId } = await params;

  const note = await db.sessionNote.findUnique({
    where: { id: noteId },
    include: {
      session: { include: { project: true } },
      threads: { include: { messages: { orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "asc" } },
    },
  });

  if (!note || note.sessionId !== sessionId || note.session.projectId !== projectId) notFound();

  return (
    <div className="space-y-6 pb-16">
      <section className="border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8">
        <div className="space-y-3 border-b border-[var(--border)] pb-7">
          <p className="font-mono-ui text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Note research board</p>
          <h1 className="font-editorial text-5xl tracking-[-0.04em]">{note.session.project.title}</h1>
          <p className="text-xl text-[var(--muted-foreground)]">Session: {note.session.title} · Note: {note.title}</p>
          <p className="max-w-[72ch] text-sm leading-7 text-[var(--muted-foreground)]">{note.body}</p>
        </div>

        <div className="relative mt-6 min-h-[680px] border border-[var(--border)] bg-[var(--surface-soft)] p-8">
          <div className="absolute left-1/2 top-1/2 w-[340px] -translate-x-1/2 -translate-y-1/2 border border-[var(--border)] bg-[var(--surface)] p-5">
            <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Central idea</p>
            <p className="mt-2 text-sm leading-7">{note.body}</p>
          </div>

          {note.threads.map((thread, index) => {
            const isLeft = index % 2 === 0;
            const top = 80 + index * 120;
            const sideClass = isLeft ? "left-10" : "right-10";
            const lineClass = isLeft ? "left-[calc(50%-180px)] w-[180px]" : "right-[calc(50%-180px)] w-[180px]";

            return (
              <div key={thread.id}>
                <div className={`absolute ${lineClass} h-px bg-[var(--foreground)]/20`} style={{ top }} />
                <section className={`absolute ${sideClass} w-[320px] border border-[var(--border)] bg-[var(--surface)] p-4`} style={{ top }}>
                  <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">{thread.topicType}</p>
                  <h2 className="mt-2 text-base font-semibold">{thread.title}</h2>
                  <div className="mt-3 space-y-2">
                    {thread.messages.map((message) => (
                      <div key={message.id} className="border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm leading-6">
                        <span className="font-mono-ui mr-2 text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">{message.role}</span>
                        {message.content}
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
