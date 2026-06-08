import type { CSSProperties } from "react";
import Link from "next/link";
import { db } from "@/lib/db";
import { MainHierarchyD3 } from "@/components/notes/MainHierarchyD3";
import { OpenCreateButton } from "@/components/navigation/OpenCreateButton";
import {
  toggleProjectPinAction,
  toggleProjectCollapsedAction,
  editProjectAction,
} from "@/app/notes/actions";
import { StarFilledIcon, StarIcon, Pencil2Icon, ChevronDownIcon, ChevronUpIcon } from "@radix-ui/react-icons";

export const dynamic = "force-dynamic";

const NOTE_CARD_HEIGHT = 92;
const NOTE_CARD_GAP = 12;

function noteBlockHeight(noteCount: number) {
  if (noteCount <= 0) return 52;
  return noteCount * NOTE_CARD_HEIGHT + (noteCount - 1) * NOTE_CARD_GAP;
}

export default async function NotesPage() {
  const projects = await db.project.findMany({
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    include: {
      sessions: {
        orderBy: { sessionKey: "desc" },
        include: {
          notes: {
            orderBy: { createdAt: "desc" },
            select: { id: true, selectedText: true, noteSummary: true, source: { select: { title: true } } },
          },
        },
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
        const isCollapsed = project.isCollapsed;
        const totalNotes = project.sessions.reduce((sum, session) => sum + session.notes.length, 0);
        let cursorY = 72;
        const visibleSessions = isCollapsed ? [] : project.sessions;
        const layout = visibleSessions.map((session) => {
          const blockHeight = noteBlockHeight(session.notes.length);
          const centerY = cursorY + blockHeight / 2;
          const topY = cursorY;
          cursorY += blockHeight + 44;
          return { session, blockHeight, topY, centerY };
        });

        const expandedProjectCardHeight = Math.max(
          220,
          132 + visibleSessions.reduce((sum, session) => sum + noteBlockHeight(session.notes.length) + 16, 0),
        );
        const projectCardHeight = isCollapsed ? 180 : expandedProjectCardHeight;
        const laneHeight = isCollapsed
          ? 260
          : Math.max(300, cursorY + 20, projectCardHeight + 90);
        const canvasId = `project-main-map-${project.id}`;

        return (
          <section key={project.id} className="reveal border border-[var(--border)] bg-[var(--surface)] p-6" style={{ "--index": projectIndex } as CSSProperties}>
            <div className={`relative ${isCollapsed ? "overflow-hidden" : "overflow-x-auto"}`}>
              <div
                id={canvasId}
                className={`relative ${isCollapsed ? "min-w-0" : "min-w-[1160px]"}`}
                style={{ height: laneHeight }}
              >
                <MainHierarchyD3
                  canvasId={canvasId}
                  sessionLinks={layout.map(({ session }) => ({ sessionId: session.id, noteIds: session.notes.map((n) => n.id) }))}
                />

                <div
                  data-node="project-card"
                  className="group absolute left-0 top-0 block w-[360px] border border-[var(--border)] bg-[var(--surface-soft)] p-6 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-[var(--surface)]"
                  style={{ minHeight: projectCardHeight }}
                >
                  <Link
                    href={`/notes/${project.id}`}
                    className="absolute inset-0 z-0"
                    aria-label={`Open project ${project.title}`}
                  />
                  <div className="flex items-start justify-between gap-3">
                    <p className="relative z-[1] font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Project</p>
                    <div className="relative z-[1] flex items-center gap-1">
                      <form action={toggleProjectPinAction}>
                        <input type="hidden" name="projectId" value={project.id} />
                        <button type="submit" className="grid h-7 w-7 place-items-center border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]">
                          {project.isPinned ? <StarFilledIcon className="h-4 w-4" /> : <StarIcon className="h-4 w-4" />}
                        </button>
                      </form>
                      <form action={toggleProjectCollapsedAction}>
                        <input type="hidden" name="projectId" value={project.id} />
                        <button type="submit" className="grid h-7 w-7 place-items-center border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]">
                          {project.isCollapsed ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronUpIcon className="h-4 w-4" />}
                        </button>
                      </form>
                      <details className="relative">
                        <summary className="grid h-7 w-7 list-none place-items-center border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]">
                          <Pencil2Icon className="h-4 w-4" />
                        </summary>
                        <form action={editProjectAction} className="absolute right-0 top-9 z-10 w-[260px] border border-[var(--border)] bg-[var(--surface)] p-3">
                          <input type="hidden" name="projectId" value={project.id} />
                          <label className="block text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Title</label>
                          <input name="title" defaultValue={project.title} className="mt-1 w-full border border-[var(--border)] bg-[var(--surface-soft)] px-2 py-1 text-sm" />
                          <label className="mt-2 block text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Description</label>
                          <textarea name="description" defaultValue={project.description || ""} className="mt-1 min-h-16 w-full border border-[var(--border)] bg-[var(--surface-soft)] px-2 py-1 text-sm" />
                          <button type="submit" className="mt-2 w-full border border-[var(--border)] bg-[var(--surface-soft)] px-2 py-1 text-xs">Save</button>
                        </form>
                      </details>
                    </div>
                  </div>
                  <h2 className="relative z-[1] mt-2 flex items-center gap-2 text-2xl font-semibold tracking-[-0.03em]">
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 text-[var(--muted-foreground)]"><path d="M3 6.5h6l1.6 2H21v9.5H3z" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M3 8.5h18" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
                    <span className="underline-offset-4 group-hover:underline">{project.title}</span>
                  </h2>
                  <p className="relative z-[1] mt-2 text-sm leading-7 text-[var(--muted-foreground)]">{project.description || "No description yet."}</p>
                  <p className="relative z-[1] mt-3 text-xs text-[var(--muted-foreground)]">{project.sessions.length} sessions · {totalNotes} notes</p>
                </div>

                {layout.map(({ session, centerY, blockHeight }) => (
                  <div key={session.id} className="absolute" style={{ left: 380, top: centerY - 7 }}>
                    <div data-node="session-dot" data-session-id={session.id} className="group/session relative h-4 w-4 rounded-full border border-[var(--foreground)]/50 bg-[var(--surface)]">
                      <div className="pointer-events-none absolute -left-10 -top-10 hidden rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] text-[var(--muted-foreground)] group-hover/session:block">{new Date(session.sessionKey).toLocaleDateString()}</div>
                    </div>
                    <div className="absolute left-[184px] w-[500px] space-y-2" style={{ top: -(blockHeight / 2) }}>
                      {session.notes.length > 0 ? session.notes.map((note) => (
                        <Link
                          key={note.id}
                          data-node="note-card"
                          data-note-id={note.id}
                          href={`/notes/${project.id}/sessions/${session.id}/notes/${note.id}`}
                          className="block h-[92px] overflow-hidden border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:translate-x-[2px] hover:bg-[var(--surface)]"
                        >
                          <p className="truncate text-sm">{note.source?.title || "No source title"}</p>
                          <p className="mt-1 line-clamp-2 text-xs text-[var(--muted-foreground)]">{note.noteSummary || note.selectedText}</p>
                        </Link>
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
