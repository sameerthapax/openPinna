import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ProjectCanvasD3 } from "@/components/notes/ProjectCanvasD3";
import { OpenCreateButton } from "@/components/navigation/OpenCreateButton";

const NOTE_CARD_HEIGHT = 84;
const NOTE_GAP = 10;
const ROW_GAP = 42;
const SESSION_CARD_HEIGHT = 98;
const HEADER_BLOCK_HEIGHT = 180;

function rowBlockHeight(noteCount: number) {
  if (noteCount <= 0) return SESSION_CARD_HEIGHT;
  return Math.max(SESSION_CARD_HEIGHT, noteCount * NOTE_CARD_HEIGHT + (noteCount - 1) * NOTE_GAP);
}

export default async function ProjectCanvasPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      sessions: {
        orderBy: { sessionKey: "asc" },
        include: {
          notes: {
            orderBy: { createdAt: "desc" },
            select: { id: true, noteText: true, noteSummary: true, source: { select: { title: true } } },
          },
        },
      },
    },
  });

  if (!project) notFound();

  let cursorY = HEADER_BLOCK_HEIGHT + 30;
  const rows = project.sessions.map((session) => {
    const blockHeight = rowBlockHeight(session.notes.length);
    const topY = cursorY;
    cursorY += blockHeight + ROW_GAP;
    return { session, topY, blockHeight };
  });

  const mapHeight = rows.length === 0 ? 560 : Math.max(700, cursorY + 24);
  const canvasId = `project-canvas-${project.id}`;

  return (
    <div className="space-y-6 pb-16">
      <section className="border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8">
        <div id={canvasId} className="relative min-h-[72dvh] w-full overflow-x-auto">
          <div className="relative min-w-[1120px]" style={{ height: mapHeight }}>
            <ProjectCanvasD3
              canvasId={canvasId}
              sessionNotes={rows.map(({ session }) => ({ sessionId: session.id, noteIds: session.notes.map((note) => note.id) }))}
            />

            <div className="absolute left-6 top-6 max-w-[560px]">
              <p className="font-mono-ui text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Project canvas</p>
              <h1 className="font-editorial mt-2 text-5xl tracking-[-0.04em]">{project.title}</h1>
              <p className="mt-2 text-xl text-[var(--muted-foreground)]">Sessions and note branches</p>
            </div>

            {rows.map(({ session, topY }) => (
              <div key={session.id} className="absolute" style={{ left: 32, top: topY }}>
                <Link
                  data-node="session-card"
                  data-session-id={session.id}
                  href={`/notes/${project.id}/sessions/${session.id}`}
                  className="block w-[240px] border border-[var(--border)] bg-[var(--surface-soft)] p-3 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:scale-[1.02]"
                >
                  <p className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Session {new Date(session.sessionKey).toLocaleDateString()}</p>
                  <h2 className="mt-1 text-base font-semibold">Research Session</h2>
                </Link>

                <div className="absolute left-[360px] top-0 w-[540px] space-y-[10px]">
                  {session.notes.length > 0 ? (
                    session.notes.map((note) => (
                      <Link
                        key={note.id}
                        data-node="note-card"
                        data-note-id={note.id}
                        href={`/notes/${project.id}/sessions/${session.id}/notes/${note.id}`}
                        className="block min-h-[84px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:translate-x-[2px] hover:bg-[var(--surface-soft)]"
                      >
                        <p className="text-sm font-medium">{note.source?.title || "No source title"}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-[var(--muted-foreground)]">{note.noteSummary || note.noteText}</p>
                      </Link>
                    ))
                  ) : (
                    <div className="border border-dashed border-[var(--border)] px-3 py-2 text-sm text-[var(--muted-foreground)]">No notes in this session yet.</div>
                  )}
                </div>
              </div>
            ))}

            {rows.length === 0 ? (
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border border-[var(--border)] bg-[var(--surface-soft)] p-6 text-center">
                <p className="text-sm text-[var(--muted-foreground)]">No sessions yet.</p>
                <div className="mt-3"><OpenCreateButton label="Create first session" /></div>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
