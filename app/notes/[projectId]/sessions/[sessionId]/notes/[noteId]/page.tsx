import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getNoteProcessingState } from "@/app/api/_lib/services/note.service";
import { listPinnasByNote } from "@/app/api/_lib/services/pinna-instance.service";
import {
  NoteKnowledgeBuildPanel,
  NoteSelectedTextPanel,
} from "@/components/notes/NoteKnowledgeBuildPanel";
import { NotePinnaBoard } from "@/components/notes/NotePinnaBoard";
import { noteSectionClass } from "@/components/notes/noteTheme";

function normalizeAuthorList(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/,|;|\band\b/gi)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => {
        if (typeof entry === "string") return [entry.trim()];
        if (entry && typeof entry === "object") {
          const record = entry as Record<string, unknown>;
          const nested =
            record.name ||
            record.fullName ||
            record.author ||
            record.creator ||
            record.family;
          return typeof nested === "string" ? [nested.trim()] : [];
        }
        return [];
      })
      .filter(Boolean);
  }

  return [];
}

export default async function NoteResearchPage({ params }: { params: Promise<{ projectId: string; sessionId: string; noteId: string }> }) {
  const { projectId, sessionId, noteId } = await params;

  const [note, processingStatus, pinnas] = await Promise.all([
    db.note.findUnique({
      where: { id: noteId },
      include: {
        session: { include: { project: true } },
        source: true,
        capture: true,
        voiceAudio: true,
        voiceSession: { include: { screenshotSession: true } },
        noteKnowledge: true,
        linkedNoteKnowledge: true,
        baseKnowledgeHead: {
          include: {
            currentVersion: true,
          },
        },
      },
    }),
    getNoteProcessingState(noteId),
    listPinnasByNote(noteId),
  ]);

  if (!note || note.sessionId !== sessionId || note.session.projectId !== projectId) notFound();
  const noteTitle = note.source?.title || note.source?.url || "No source";
  const selectedText = note.selectedText || "";
  const noteOpinion = note.userCommentary || "";
  const noteKnowledge =
    note.baseKnowledgeHead?.currentVersion ||
    note.linkedNoteKnowledge ||
    note.noteKnowledge ||
    null;
  const sessionDateLabel = new Date(note.session.sessionKey).toLocaleDateString();
  const sourceMetadata =
    note.source?.metadata && typeof note.source.metadata === "object" && !Array.isArray(note.source.metadata)
      ? (note.source.metadata as Record<string, unknown>)
      : {};
  const knowledgeAuthors = normalizeAuthorList(
    note.baseKnowledgeHead?.currentVersion?.authors ??
      note.linkedNoteKnowledge?.authors ??
      note.noteKnowledge?.authors,
  );
  const metadataAuthors =
    [
      sourceMetadata.authors,
      sourceMetadata.author,
      sourceMetadata.creators,
      sourceMetadata.creator,
      sourceMetadata.byline,
    ]
      .map((value) => normalizeAuthorList(value))
      .find((entries) => entries.length > 0) || [];
  const authors = Array.from(
    new Set([
      ...knowledgeAuthors,
      ...(Array.isArray(note.source?.authors)
        ? note.source.authors
            .map((author) => (typeof author === "string" ? author.trim() : ""))
            .filter(Boolean)
        : []),
      ...metadataAuthors,
    ]),
  );
  const voiceAudioUrl = note.voiceAudio?.fullAudioPath ? `/api/voice-audios/${note.voiceAudio.id}` : null;
  const captureUrl = note.capture ? `/api/captures/${note.capture.id}` : null;
  const captureType = note.capture?.artifactType || "screenshot";
  const captureLabel = captureType === "pdf" ? "Open captured PDF" : "Open screenshot";
  const captureBadgeLabel = captureType === "pdf" ? "PDF captured" : "Screenshot captured";
  const initialProcessingStatus = {
    ...processingStatus,
    updatedAt: processingStatus.updatedAt ? processingStatus.updatedAt.toISOString() : null,
  };

  return (
    <div className="space-y-6 pb-16">
      <section className={`${noteSectionClass} p-6 md:p-8`}>
        <div className="space-y-3 border-b border-[color-mix(in_srgb,var(--foreground)_8%,transparent)] pb-7">
          <p className="font-mono-ui text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Note research board</p>
          <h1 className="font-editorial text-5xl tracking-[-0.04em]">{note.session.project.title}</h1>
          <p className="text-xl text-[var(--muted-foreground)]">Session: {sessionDateLabel} · Note: {noteTitle}</p>
        </div>

        <div className="mt-6 grid items-stretch grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.85fr)_minmax(360px,0.95fr)]">
          <NotePinnaBoard
            noteId={note.id}
            noteTitle={noteTitle}
            noteOpinion={noteOpinion}
            noteSummary={noteKnowledge?.summary || note.noteSummary || ""}
            knowledgeSections={
              noteKnowledge
                ? {
                    keyFindings: noteKnowledge.keyFindings,
                    userView: noteKnowledge.userView,
                    conclusion: noteKnowledge.conclusion,
                  }
                : null
            }
            sourceDetails={{
              sourceType: note.source?.sourceType || null,
              title: note.source?.title || null,
              abstract: noteKnowledge?.abstract || note.source?.abstract || null,
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
            captureArtifact={
              note.capture
                ? {
                    captureUrl,
                    captureLabel,
                    captureBadgeLabel,
                    fileName: note.capture.fileName || note.capture.title || noteTitle,
                    artifactType: captureType === "pdf" ? "pdf" : "screenshot",
                  }
                : null
            }
            initialPinnas={pinnas.map((pinna) => {
              const primaryThread = pinna.chatThreads[0] || null;
              return {
                id: pinna.id,
                threadId: primaryThread?.id || pinna.id,
                question:
                  pinna.title ||
                  pinna.pinnaTemplate?.defaultTitle ||
                  primaryThread?.title ||
                  primaryThread?.threadType ||
                  "Pinna",
                title: pinna.title || primaryThread?.title,
                baseVersion:
                  pinna.selectedBaseKnowledgeVersion != null
                    ? {
                        id: pinna.selectedBaseKnowledgeVersion.id,
                        version: pinna.selectedBaseKnowledgeVersion.version,
                        title: pinna.selectedBaseKnowledgeVersion.title,
                      }
                    : null,
                messages:
                  primaryThread?.messages
                    .slice()
                    .reverse()
                    .map((message) => ({
                    id: message.id,
                    role: message.role,
                    content: message.content,
                    createdAt: message.createdAt.toISOString(),
                  })) || [],
                hasOlderMessages: (primaryThread?._count.messages || 0) > (primaryThread?.messages.length || 0),
              };
            })}
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

          <NoteSelectedTextPanel selectedText={selectedText} />
        </div>

        <div className="mt-5">
          <NoteKnowledgeBuildPanel
            noteId={note.id}
            initialKnowledge={
              noteKnowledge
                ? {
                    id: noteKnowledge.id,
                    title: noteKnowledge.title,
                    summary: noteKnowledge.summary,
                    keyFindings: noteKnowledge.keyFindings,
                    userView: noteKnowledge.userView,
                    conclusion: noteKnowledge.conclusion,
                    model: noteKnowledge.model,
                    updatedAt:
                      "updatedAt" in noteKnowledge
                        ? noteKnowledge.updatedAt.toISOString()
                        : noteKnowledge.createdAt.toISOString(),
                  }
                : null
            }
            initialProcessingStatus={initialProcessingStatus}
          />
        </div>
      </section>
    </div>
  );
}
