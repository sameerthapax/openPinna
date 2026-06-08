import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { SessionCanvas } from "@/components/notes/SessionCanvas";
import { OpenCreateButton } from "@/components/navigation/OpenCreateButton";

export default async function SessionPage({ params }: { params: Promise<{ projectId: string; sessionId: string }> }) {
  const { projectId, sessionId } = await params;

  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: {
      project: true,
      notes: { include: { source: true }, orderBy: { createdAt: "desc" } },
    },
  });

  if (!session || session.projectId !== projectId) notFound();

  return (
    <div className="space-y-6 pb-16">
      <section className="border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8">
        <div className="mb-4 max-w-[680px]">
          <p className="font-mono-ui text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Session timeline map</p>
          <h1 className="font-editorial mt-2 text-5xl tracking-[-0.04em]">{session.project.title}</h1>
          <p className="mt-2 text-xl text-[var(--muted-foreground)]">Session: {new Date(session.sessionKey).toLocaleDateString()}</p>
        </div>

        {session.notes.length === 0 ? (
          <div className="grid min-h-[48dvh] place-items-center border border-dashed border-[var(--border)] bg-[var(--surface-soft)]">
            <div className="text-center">
              <p className="text-sm text-[var(--muted-foreground)]">No notes in this session.</p>
              <div className="mt-3"><OpenCreateButton label="Create first note" /></div>
            </div>
          </div>
        ) : (
          <SessionCanvas
            projectId={projectId}
            sessionId={sessionId}
            notes={session.notes.map((note) => ({
              id: note.id,
              title: note.source?.title || "No source title",
              body: note.noteSummary || note.selectedText,
              capturedAt: note.createdAt,
            }))}
          />
        )}
      </section>
    </div>
  );
}
