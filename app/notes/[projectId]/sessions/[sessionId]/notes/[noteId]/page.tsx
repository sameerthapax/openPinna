import { notFound } from "next/navigation";
import { FileTextIcon, ImageIcon } from "@radix-ui/react-icons";
import { db } from "@/lib/db";
import { NotePinnaBoard } from "@/components/notes/NotePinnaBoard";

export default async function NoteResearchPage({ params }: { params: Promise<{ projectId: string; sessionId: string; noteId: string }> }) {
  const { projectId, sessionId, noteId } = await params;

  const note = await db.note.findUnique({
    where: { id: noteId },
    include: {
      session: { include: { project: true } },
      source: true,
      capture: true,
      voiceAudio: true,
      voiceSession: true,
      chatThreads: {
        include: {
          messages: { orderBy: { createdAt: "asc" } },
          pinnaTemplate: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!note || note.sessionId !== sessionId || note.session.projectId !== projectId) notFound();
  const noteTitle = note.source?.title || note.source?.url || "No source";
  const selectedText = note.noteText || "";
  const noteOpinion = note.userCommentary || "";
  const knowledgeBuild = note.aiExtractedClaim || "";
  const sessionDateLabel = new Date(note.session.sessionKey).toLocaleDateString();
  const sourceMetadata =
    note.source?.metadata && typeof note.source.metadata === "object" && !Array.isArray(note.source.metadata)
      ? (note.source.metadata as Record<string, unknown>)
      : {};
  const authors = Array.isArray(note.source?.authors)
    ? note.source.authors
        .map((author) => (typeof author === "string" ? author : ""))
        .filter(Boolean)
    : [];
  const voiceAudioUrl = note.voiceAudio?.fullAudioPath ? `/api/voice-audios/${note.voiceAudio.id}` : null;
  const captureUrl = note.capture ? `/api/captures/${note.capture.id}` : null;
  const captureType = note.capture?.artifactType || "screenshot";
  const captureLabel = captureType === "pdf" ? "Open captured PDF" : "Open screenshot";
  const captureBadgeLabel = captureType === "pdf" ? "PDF captured" : "Screenshot captured";
  const CaptureIcon = captureType === "pdf" ? FileTextIcon : ImageIcon;

  return (
    <div className="space-y-6 pb-16">
      <section className="border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8">
        <div className="space-y-3 border-b border-[var(--border)] pb-7">
          <p className="font-mono-ui text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Note research board</p>
          <h1 className="font-editorial text-5xl tracking-[-0.04em]">{note.session.project.title}</h1>
          <p className="text-xl text-[var(--muted-foreground)]">Session: {sessionDateLabel} · Note: {noteTitle}</p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
          <NotePinnaBoard
            noteId={note.id}
            noteTitle={noteTitle}
            selectedText={selectedText}
            noteOpinion={noteOpinion}
            noteSummary={note.noteSummary || ""}
            knowledgeBuild={knowledgeBuild}
            sourceDetails={{
              sourceType: note.source?.sourceType || null,
              title: note.source?.title || null,
              abstract: note.source?.abstract || null,
              authors,
              publicationYear: note.source?.publicationYear || null,
              publicationDate: note.source?.publicationDate?.toISOString() || null,
              venue: note.source?.venue || null,
              doi: note.source?.doi || null,
              url: note.source?.url || null,
              pdfUrl: note.source?.pdfUrl || null,
              metadata: sourceMetadata,
            }}
            voiceRecording={
              note.voiceAudio
                ? {
                    audioId: note.voiceAudio.id,
                    audioUrl: voiceAudioUrl,
                    mimeType: note.voiceAudio.mimeType || null,
                    transcript: note.voiceAudio.finalTranscript || null,
                    durationMs: note.voiceAudio.durationMs || null,
                    pageTitle: note.voiceSession?.pageTitle || null,
                    pageUrl: note.voiceSession?.pageUrl || null,
                    captureUrl,
                    captureLabel,
                    startedAt: note.voiceSession?.startedAt?.toISOString() || null,
                  }
                : null
            }
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
            initialLayout={
              note.pinnaLayout &&
              typeof note.pinnaLayout === "object" &&
              !Array.isArray(note.pinnaLayout)
                ? (note.pinnaLayout as {
                    zoom: number;
                    nodes: Array<{ id: string; x: number; y: number }>;
                  })
                : null
            }
          />

          <aside className="border border-[var(--border)] bg-[var(--surface)] p-5">
            <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Knowledge build</p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em]">Note-level knowledge base</h2>

            <div className="mt-4 space-y-4 text-sm leading-7 text-[var(--muted-foreground)]">
              <p>
                <span className="text-[var(--foreground)]">SS:</span>{" "}
                {note.capture?.id ? note.capture.id.slice(0, 12) : "No capture artifact"}
              </p>
              {captureUrl ? (
                <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-soft)] p-3">
                  <div className="flex items-center gap-2 text-[var(--foreground)]">
                    <CaptureIcon className="h-4 w-4" />
                    <span className="text-sm font-medium">{captureBadgeLabel}</span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                    {note.capture?.fileName || note.capture?.title || noteTitle}
                  </p>
                  <a
                    href={captureUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex text-sm underline decoration-[var(--border)] underline-offset-4"
                  >
                    {captureLabel}
                  </a>
                </div>
              ) : null}
              <p>
                <span className="text-[var(--foreground)]">Title:</span> {noteTitle}
              </p>
              <p>
                <span className="text-[var(--foreground)]">Selected text:</span>{" "}
                <span className="mt-2 block max-h-40 overflow-y-auto border border-[var(--border)] bg-[var(--surface-soft)] p-3 pr-2">
                  {selectedText || "No selected text"}
                </span>
              </p>
              <p>
                <span className="text-[var(--foreground)]">My opinion:</span>{" "}
                <span className="mt-2 block max-h-40 overflow-y-auto border border-[var(--border)] bg-[var(--surface-soft)] p-3 pr-2">
                  {noteOpinion || "No opinion captured"}
                </span>
              </p>
              <p>
                <span className="text-[var(--foreground)]">Summary:</span>{" "}
                <span className="mt-2 block max-h-40 overflow-y-auto border border-[var(--border)] bg-[var(--surface-soft)] p-3 pr-2">
                  {note.noteSummary || "No note summary generated yet"}
                </span>
              </p>
              <p>
                <span className="text-[var(--foreground)]">Knowledge build:</span>{" "}
                <span className="mt-2 block max-h-40 overflow-y-auto border border-[var(--border)] bg-[var(--surface-soft)] p-3 pr-2">
                  {knowledgeBuild || "No AI extracted claim generated yet"}
                </span>
              </p>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
