import type { CSSProperties } from "react";
import Link from "next/link";
import { db } from "@/lib/db";
import { MainHierarchyD3 } from "@/components/notes/MainHierarchyD3";
import { OpenCreateButton } from "@/components/navigation/OpenCreateButton";

export const dynamic = "force-dynamic";

function noteBlockHeight(noteCount: number) {
  return Math.max(52, noteCount * 48 + 8);
}

export default async function NotesPage() {
  const projects = await db.project.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      sessions: {
        orderBy: { sessionDate: "asc" },
        include: { notes: { orderBy: { capturedAt: "asc" }, select: { id: true, title: true } } },
      },
    },
  });

  if (projects.length === 0) {
    return (
      <section className="grid min-h-[72dvh] place-items-center border border-[var(--border)] bg-[var(--surface)]">
        <div className="text-center">
          <h1 className="font-editorial text-5xl tracking-[-0.04em]">Research map</h1>
          <p className="mt-3 text-[var(--muted-foreground)]">No projects yet.</p>
          <div className="mt-4"><OpenCreateButton label="Create first project" /></div>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      {projects.map((project, projectIndex) => {
        let cursorY = 72;
        const layout = project.sessions.map((session) => {
          const blockHeight = noteBlockHeight(session.notes.length);
          const centerY = cursorY + blockHeight / 2;
          const topY = cursorY;
          cursorY += blockHeight + 44;
          return { session, blockHeight, topY, centerY };
        });

        const laneHeight = layout.length === 0 ? 260 : Math.max(300, cursorY + 20);
        const canvasId = `project-main-map-${project.id}`;

        return (
          <section key={project.id} className="reveal border border-[var(--border)] bg-[var(--surface)] p-6" style={{ "--index": projectIndex } as CSSProperties}>
            <div className="relative overflow-x-auto">
              <div id={canvasId} className="relative min-w-[1160px]" style={{ height: laneHeight }}>
                <MainHierarchyD3
                  canvasId={canvasId}
                  sessionLinks={layout.map(({ session }) => ({ sessionId: session.id, noteIds: session.notes.map((n) => n.id) }))}
                />

                <Link
                  href={`/notes/${project.id}`}
                  data-node="project-card"
                  className="group absolute left-0 top-0 block w-[320px] border border-[var(--border)] bg-[var(--surface-soft)] p-6 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:translate-x-[2px] hover:bg-[var(--surface)]"
                >
                  <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Project</p>
                  <h2 className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-[-0.03em]">
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 text-[var(--muted-foreground)]"><path d="M3 6.5h6l1.6 2H21v9.5H3z" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M3 8.5h18" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
                    <span className="underline-offset-4 group-hover:underline">{project.title}</span>
                  </h2>
                  <p className="mt-2 text-sm leading-7 text-[var(--muted-foreground)]">{project.description || "No description yet."}</p>
                </Link>

                {layout.map(({ session, centerY, blockHeight }) => (
                  <div key={session.id} className="absolute" style={{ left: 380, top: centerY - 7 }}>
                    <div data-node="session-dot" data-session-id={session.id} className="group/session relative h-4 w-4 rounded-full border border-[var(--foreground)]/50 bg-[var(--surface)]">
                      <div className="pointer-events-none absolute -left-10 -top-10 hidden rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] text-[var(--muted-foreground)] group-hover/session:block">{new Date(session.sessionDate).toLocaleDateString()}</div>
                    </div>
                    <div className="absolute left-[184px] w-[500px] space-y-2" style={{ top: -(blockHeight / 2) }}>
                      {session.notes.length > 0 ? session.notes.map((note) => (
                        <Link key={note.id} data-node="note-card" data-note-id={note.id} href={`/notes/${project.id}/sessions/${session.id}/notes/${note.id}`} className="block border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:translate-x-[2px] hover:bg-[var(--surface)]">{note.title}</Link>
                      )) : <div className="border border-dashed border-[var(--border)] px-3 py-2 text-sm text-[var(--muted-foreground)]">No notes</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
