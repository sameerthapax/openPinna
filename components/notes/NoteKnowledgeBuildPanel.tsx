"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircledIcon,
  ExclamationTriangleIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import {
  noteCoreClass,
  noteMiniCardClass,
  notePanelClass,
  notePillClass,
  noteShellClass,
} from "@/components/notes/noteTheme";

type NoteKnowledgeRecord = {
  id: string;
  title: string | null;
  summary: string | null;
  keyFindings: string;
  userView: string;
  conclusion: string;
  model: string | null;
  updatedAt: string;
};

type ProcessingStatus =
  | {
      state: "pending" | "processing";
      hasKnowledge: boolean;
      activeJobId: string;
      attempts: number;
      maxAttempts: number;
      updatedAt: string | null;
      lastError: string | null;
    }
  | {
      state: "failed";
      hasKnowledge: boolean;
      activeJobId: null;
      attempts: number;
      maxAttempts: number;
      updatedAt: string | null;
      lastError: string | null;
    }
  | {
      state: "ready" | "idle";
      hasKnowledge: boolean;
      activeJobId: null;
      attempts: number | null;
      maxAttempts: number | null;
      updatedAt: string | null;
      lastError: string | null;
    };

type Props = {
  noteId: string;
  initialKnowledge: NoteKnowledgeRecord | null;
  initialProcessingStatus: ProcessingStatus;
};

type NoteApiResponse = {
  ok: boolean;
  note?: {
    baseKnowledgeHead?: {
      currentVersion?:
        | (Omit<NoteKnowledgeRecord, "updatedAt"> & { createdAt?: string; updatedAt?: string })
        | null;
    } | null;
    linkedNoteKnowledge?: NoteKnowledgeRecord | null;
    noteKnowledge?: NoteKnowledgeRecord | null;
  };
  processingStatus?: ProcessingStatus;
  message?: string;
};

function normalizeKnowledgeRecord(
  value:
    | NoteKnowledgeRecord
    | (Omit<NoteKnowledgeRecord, "updatedAt"> & { createdAt?: string; updatedAt?: string })
    | null
    | undefined,
) {
  if (!value) return null;

  return {
    ...value,
    updatedAt:
      value.updatedAt ||
      ("createdAt" in value ? value.createdAt : undefined) ||
      new Date().toISOString(),
  };
}

export function NoteSelectedTextPanel({ selectedText }: { selectedText: string }) {
  return (
    <aside
      className={`${noteShellClass} reveal h-[84dvh] min-h-[80dvh] max-h-[90dvh]`}
      style={{ ["--index" as string]: 0 }}
    >
      <div className={`${noteCoreClass} flex h-full min-h-0 flex-col`}>
        <div className="flex items-start justify-between gap-4 border-b border-[color-mix(in_srgb,var(--foreground)_7%,transparent)] pb-4">
          <div>
            <p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
              Selected text
            </p>
            <p className="mt-2 max-w-[26ch] text-sm leading-6 text-[var(--muted-foreground)]">
              Captured evidence stays visible beside the board and scrolls independently when the excerpt runs long.
            </p>
          </div>
          <span className={notePillClass}>
            Evidence
          </span>
        </div>

        <div className={`${noteMiniCardClass} mt-4 min-h-0 flex-1 overflow-y-auto text-sm leading-7 text-[var(--foreground)] md:px-5`}>
          {selectedText || "No selected text captured yet."}
        </div>
      </div>
    </aside>
  );
}

function KnowledgeLoadingCard({
  processingStatus,
  onRefresh,
}: {
  processingStatus: ProcessingStatus;
  onRefresh: () => void;
}) {
  return (
    <div className={noteShellClass}>
      <div className={`${noteCoreClass} min-h-[380px]`}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_300px]">
          <div className="space-y-6">
            <div className="space-y-3">
              <span className="inline-flex rounded-full bg-[var(--muted)] px-3 py-1 font-mono-ui text-[10px] uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
                Backend processing
              </span>
              <div className="space-y-2">
                <h2 className="max-w-[13ch] text-3xl font-semibold tracking-[-0.05em] text-[var(--foreground)]">
                  Building a grounded knowledge brief
                </h2>
                <p className="max-w-[56ch] text-sm leading-7 text-[var(--muted-foreground)]">
                  OpenPinna is turning raw capture evidence into a readable synthesis with source context, user interpretation, and a final conclusion.
                </p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr_1fr]">
              {[
                "Claiming the current processing job",
                "Extracting grounded context from screenshots and audio",
                "Writing the final knowledge brief back to the note",
              ].map((step, index) => (
                <div key={step} className={`${notePanelClass} flex min-h-[138px] flex-col justify-between`}>
                  <div className="flex items-start gap-3">
                    <span className="knowledge-pulse mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-[var(--pastel-blue-text)]" />
                    <p className="text-sm leading-6 text-[var(--foreground)]">{step}</p>
                  </div>
                  <div
                    className="knowledge-shimmer mt-6 h-2 rounded-full bg-[linear-gradient(90deg,color-mix(in_srgb,var(--foreground)_6%,transparent)_0%,color-mix(in_srgb,var(--foreground)_16%,transparent)_50%,color-mix(in_srgb,var(--foreground)_6%,transparent)_100%)]"
                    style={{ width: `${86 - index * 12}%` }}
                  />
                </div>
              ))}
            </div>
          </div>

          <aside className={`${notePanelClass} flex flex-col justify-between`}>
            <div>
              <p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                Build pulse
              </p>
              <div className="knowledge-orbit relative mt-4 h-14 w-14 rounded-full border border-[color-mix(in_srgb,var(--foreground)_8%,transparent)] bg-[var(--surface-soft)]" />
            </div>
            <div className="mt-8 space-y-3">
              <p className="text-sm leading-6 text-[var(--muted-foreground)]">
                <span className="text-[var(--foreground)]">State:</span> {processingStatus.state}
              </p>
              <p className="text-sm leading-6 text-[var(--muted-foreground)]">
                <span className="text-[var(--foreground)]">Attempts:</span>{" "}
                {processingStatus.attempts !== null ? processingStatus.attempts : "Pending"}
              </p>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              className="group mt-8 inline-flex items-center gap-2 self-start rounded-full border border-[color-mix(in_srgb,var(--foreground)_8%,transparent)] bg-[var(--surface-soft)] px-4 py-2.5 text-sm transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-[1px] hover:bg-[var(--surface)] active:scale-[0.98]"
            >
              <span>Refresh status</span>
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1 group-hover:-translate-y-[1px]">
                <ReloadIcon className="h-3.5 w-3.5" />
              </span>
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}

function KnowledgeFailedCard({
  processingStatus,
  onRefresh,
}: {
  processingStatus: Extract<ProcessingStatus, { state: "failed" }>;
  onRefresh: () => void;
}) {
  return (
    <div className={noteShellClass}>
      <div className={`${noteCoreClass} min-h-[320px]`}>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_320px]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--pastel-red)] px-3 py-1 font-mono-ui text-[10px] uppercase tracking-[0.18em] text-[var(--pastel-red-text)]">
              <ExclamationTriangleIcon className="h-3.5 w-3.5" />
              Build failed
            </div>
            <div className="mt-4 space-y-3">
              <h2 className="max-w-[14ch] text-3xl font-semibold tracking-[-0.05em] text-[var(--foreground)]">
                The knowledge build stopped before the brief was ready
              </h2>
              <p className="max-w-[56ch] text-sm leading-7 text-[var(--muted-foreground)]">
                Refresh after the backend issue is resolved or another job is queued. The note remains available, but the synthesized reading view is incomplete.
              </p>
            </div>

            <div className={`${noteMiniCardClass} mt-6 rounded-[1.6rem] px-4 py-4 text-sm leading-7 text-[var(--foreground)]`}>
              {processingStatus.lastError || "No detailed error message was recorded."}
            </div>
          </div>

          <aside className={notePanelClass}>
            <p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
              Run details
            </p>
            <div className="mt-4 space-y-3 text-sm leading-6 text-[var(--muted-foreground)]">
              <p>
                <span className="text-[var(--foreground)]">Attempts used:</span>{" "}
                {processingStatus.attempts} / {processingStatus.maxAttempts}
              </p>
              <p>
                <span className="text-[var(--foreground)]">State:</span> {processingStatus.state}
              </p>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              className="group mt-6 inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--foreground)_8%,transparent)] bg-[var(--surface-soft)] px-4 py-2.5 text-sm transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-[1px] hover:bg-[var(--surface)] active:scale-[0.98]"
            >
              <span>Refresh panel</span>
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1 group-hover:-translate-y-[1px]">
                <ReloadIcon className="h-3.5 w-3.5" />
              </span>
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}

function KnowledgeReadyCard({ knowledge }: { knowledge: NoteKnowledgeRecord }) {
  const summary = knowledge.summary || "No synthesis summary has been generated yet.";

  return (
    <div className={noteShellClass}>
      <div className={`${noteCoreClass} min-h-[420px]`}>
        <div className="space-y-6">
          <div className="space-y-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--pastel-green)] px-3 py-1 font-mono-ui text-[10px] uppercase tracking-[0.18em] text-[var(--pastel-green-text)]">
              <CheckCircledIcon className="h-3.5 w-3.5" />
              Knowledge build ready
            </span>
            <div className="space-y-2">
              <h2 className="max-w-[16ch] text-3xl font-semibold tracking-[-0.05em] text-[var(--foreground)]">
                Note knowledge brief
              </h2>
              <p className="text-sm leading-7 text-[var(--muted-foreground)]">
                A readable synthesis of the note, separated into evidence, interpretation, and forward takeaway.
              </p>
            </div>
          </div>

          <section className={`${notePanelClass} reveal`} style={{ ["--index" as string]: 0 }}>
            <p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
              Lead summary
            </p>
            <div className="mt-4 text-base leading-8 text-[var(--foreground)]">
              {summary}
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <section className={`${notePanelClass} reveal`} style={{ ["--index" as string]: 1 }}>
              <p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                Key findings
              </p>
              <div className="mt-4 text-sm leading-8 text-[var(--foreground)]">
                {knowledge.keyFindings}
              </div>
            </section>

            <div className="grid gap-4">
              <section className={`${notePanelClass} reveal`} style={{ ["--index" as string]: 2 }}>
                <p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                  User view
                </p>
                <div className="mt-4 text-sm leading-8 text-[var(--foreground)]">
                  {knowledge.userView}
                </div>
              </section>

              <section className={`${notePanelClass} reveal`} style={{ ["--index" as string]: 3 }}>
                <p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                  Conclusion
                </p>
                <div className="mt-4 text-sm leading-8 text-[var(--foreground)]">
                  {knowledge.conclusion}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function NoteKnowledgeBuildPanel({
  noteId,
  initialKnowledge,
  initialProcessingStatus,
}: Props) {
  const router = useRouter();
  const [knowledge, setKnowledge] = useState<NoteKnowledgeRecord | null>(initialKnowledge);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>(initialProcessingStatus);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasRefreshedServerRef = useRef(Boolean(initialKnowledge));

  const fetchSnapshot = useCallback(async () => {
    const response = await fetch(`/api/notes/${noteId}`, {
      method: "GET",
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as NoteApiResponse | null;

    if (!response.ok || !payload?.ok || !payload.note || !payload.processingStatus) {
      throw new Error(payload?.message || "Could not refresh note knowledge.");
    }

    const nextKnowledge = normalizeKnowledgeRecord(
      payload.note.baseKnowledgeHead?.currentVersion ||
        payload.note.linkedNoteKnowledge ||
        payload.note.noteKnowledge ||
        null,
    );
    setKnowledge(nextKnowledge);
    setProcessingStatus(payload.processingStatus);

    if (nextKnowledge && !hasRefreshedServerRef.current) {
      hasRefreshedServerRef.current = true;
      router.refresh();
    }
  }, [noteId, router]);

  useEffect(() => {
    const shouldPoll =
      processingStatus.state === "pending" ||
      processingStatus.state === "processing" ||
      (processingStatus.state === "idle" && !knowledge);

    if (!shouldPoll) return;

    let cancelled = false;
    let timeoutId: number | null = null;

    const poll = async () => {
      try {
        await fetchSnapshot();
      } catch {
        // Keep last known state and retry on next tick.
      } finally {
        if (!cancelled) {
          timeoutId = window.setTimeout(() => {
            void poll();
          }, 5000);
        }
      }
    };

    timeoutId = window.setTimeout(() => {
      void poll();
    }, 2500);

    return () => {
      cancelled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [fetchSnapshot, knowledge, processingStatus.state]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchSnapshot();
      router.refresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <section
      className={`reveal ${isRefreshing ? "opacity-90 transition-opacity duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]" : ""}`}
      style={{ ["--index" as string]: 1 }}
    >
      {!knowledge && processingStatus.state === "failed" ? (
        <KnowledgeFailedCard
          processingStatus={processingStatus}
          onRefresh={() => void handleRefresh()}
        />
      ) : !knowledge ? (
        <KnowledgeLoadingCard
          processingStatus={processingStatus}
          onRefresh={() => void handleRefresh()}
        />
      ) : (
        <KnowledgeReadyCard knowledge={knowledge} />
      )}
    </section>
  );
}
