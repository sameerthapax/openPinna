"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircledIcon,
  ExclamationTriangleIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";

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
    linkedNoteKnowledge?: NoteKnowledgeRecord | null;
    noteKnowledge?: NoteKnowledgeRecord | null;
  };
  processingStatus?: ProcessingStatus;
  message?: string;
};

function shellClasses() {
  return "rounded-[2rem] bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)] p-1.5 ring-1 ring-[color-mix(in_srgb,var(--foreground)_8%,transparent)]";
}

function coreClasses() {
  return "rounded-[calc(2rem-0.375rem)] bg-[var(--surface)] px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.42)] md:px-6 md:py-6";
}

export function NoteSelectedTextPanel({ selectedText }: { selectedText: string }) {
  return (
    <aside className={`${shellClasses()} reveal min-h-[16dvh] xl:min-h-[17dvh]`} style={{ ["--index" as string]: 0 }}>
      <div className={`${coreClasses()} flex min-h-[16dvh] flex-col xl:min-h-[17dvh]`}>
        <div className="border-b border-[color-mix(in_srgb,var(--foreground)_7%,transparent)] pb-3">
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
            Selected text
          </p>
        </div>

        <div className="mt-3 flex-1 overflow-y-auto rounded-[1.45rem] border border-[color-mix(in_srgb,var(--foreground)_7%,transparent)] bg-[var(--surface-soft)] px-4 py-3 text-sm leading-6 text-[var(--foreground)] md:px-5">
          {selectedText || "No selected text captured yet."}
        </div>
      </div>
    </aside>
  );
}

function formatTimestamp(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

function KnowledgeLoadingCard({
  processingStatus,
  onRefresh,
}: {
  processingStatus: ProcessingStatus;
  onRefresh: () => void;
}) {
  return (
    <div className={shellClasses()}>
      <div className={`${coreClasses()} min-h-[340px] lg:min-h-[300px]`}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <span className="inline-flex rounded-full bg-[var(--muted)] px-3 py-1 font-mono-ui text-[10px] uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
              Backend processing
            </span>
            <div className="space-y-2">
              <h2 className="max-w-[14ch] text-3xl font-semibold tracking-[-0.05em] text-[var(--foreground)]">
                Backend is building the note knowledge
              </h2>
              <p className="max-w-[48ch] text-sm leading-7 text-[var(--muted-foreground)]">
                OpenPinna is extracting context, consolidating transcript and screenshot evidence, and writing the final knowledge build back to this note.
              </p>
            </div>
          </div>

          <div className="knowledge-orbit relative mt-1 h-12 w-12 rounded-full border border-[color-mix(in_srgb,var(--foreground)_8%,transparent)] bg-[var(--surface-soft)]" />
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {[
            "Claiming the queued processing job",
            "Extracting grounded context from screenshots and audio",
            "Writing note knowledge back to the database",
          ].map((step, index) => (
            <div
              key={step}
              className="rounded-[1.35rem] border border-[color-mix(in_srgb,var(--foreground)_7%,transparent)] bg-[var(--surface-soft)] px-4 py-4"
            >
              <div className="flex items-start gap-3">
                <span className="knowledge-pulse mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-[var(--pastel-blue-text)]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-6 text-[var(--foreground)]">{step}</p>
                  <div
                    className="knowledge-shimmer mt-3 h-2 rounded-full bg-[linear-gradient(90deg,color-mix(in_srgb,var(--foreground)_6%,transparent)_0%,color-mix(in_srgb,var(--foreground)_16%,transparent)_50%,color-mix(in_srgb,var(--foreground)_6%,transparent)_100%)]"
                    style={{ width: `${84 - index * 10}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[color-mix(in_srgb,var(--foreground)_7%,transparent)] pt-5">
          <div className="text-sm leading-6 text-[var(--muted-foreground)]">
            <span className="text-[var(--foreground)]">State:</span> {processingStatus.state}
            {processingStatus.attempts !== null ? ` · Attempt ${processingStatus.attempts}` : ""}
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="group inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--foreground)_8%,transparent)] bg-[var(--surface-soft)] px-4 py-2.5 text-sm transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-[1px] hover:bg-[var(--surface)] active:scale-[0.98]"
          >
            <span>Refresh status</span>
            <span className="grid h-7 w-7 place-items-center rounded-full bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1 group-hover:-translate-y-[1px]">
              <ReloadIcon className="h-3.5 w-3.5" />
            </span>
          </button>
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
    <div className={shellClasses()}>
      <div className={`${coreClasses()} min-h-[320px]`}>
        <div className="inline-flex items-center gap-2 rounded-full bg-[var(--pastel-red)] px-3 py-1 font-mono-ui text-[10px] uppercase tracking-[0.18em] text-[var(--pastel-red-text)]">
          <ExclamationTriangleIcon className="h-3.5 w-3.5" />
          Build failed
        </div>
        <div className="mt-4 space-y-3">
          <h2 className="max-w-[14ch] text-3xl font-semibold tracking-[-0.05em] text-[var(--foreground)]">
            The backend build stopped before the knowledge record was ready
          </h2>
          <p className="text-sm leading-7 text-[var(--muted-foreground)]">
            The job moved to processing history as failed. Refresh after the underlying issue is resolved or another job is queued.
          </p>
        </div>
        <div className="mt-6 rounded-[1.35rem] border border-[color-mix(in_srgb,var(--pastel-red-text)_16%,transparent)] bg-[var(--surface-soft)] px-4 py-4 text-sm leading-7 text-[var(--foreground)]">
          {processingStatus.lastError || "No detailed error message was recorded."}
        </div>
        <div className="mt-6 flex items-center justify-between gap-3">
          <span className="text-sm text-[var(--muted-foreground)]">
            Attempts used: {processingStatus.attempts} / {processingStatus.maxAttempts}
          </span>
          <button
            type="button"
            onClick={onRefresh}
            className="group inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--foreground)_8%,transparent)] bg-[var(--surface-soft)] px-4 py-2.5 text-sm transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-[1px] hover:bg-[var(--surface)] active:scale-[0.98]"
          >
            <span>Refresh panel</span>
            <span className="grid h-7 w-7 place-items-center rounded-full bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1 group-hover:-translate-y-[1px]">
              <ReloadIcon className="h-3.5 w-3.5" />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function KnowledgeReadyCard({ knowledge }: { knowledge: NoteKnowledgeRecord }) {
  return (
    <div className={shellClasses()}>
      <div className={`${coreClasses()} min-h-[360px]`}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--pastel-green)] px-3 py-1 font-mono-ui text-[10px] uppercase tracking-[0.18em] text-[var(--pastel-green-text)]">
              <CheckCircledIcon className="h-3.5 w-3.5" />
              Knowledge build ready
            </span>
            <div className="space-y-2">
              <h2 className="max-w-[16ch] text-3xl font-semibold tracking-[-0.05em] text-[var(--foreground)]">
                Note knowledge build
              </h2>
              <p className="text-sm leading-7 text-[var(--muted-foreground)]">
                {knowledge.model ? `Generated with ${knowledge.model}.` : "Generated knowledge build."} Updated {formatTimestamp(knowledge.updatedAt) || "recently"}.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-4 xl:grid-cols-3">
          {[
            { label: "Key findings", value: knowledge.keyFindings },
            { label: "User view", value: knowledge.userView },
            { label: "Conclusion", value: knowledge.conclusion },
          ].map((section, index) => (
            <div
              key={section.label}
              className="reveal rounded-[1.45rem] border border-[color-mix(in_srgb,var(--foreground)_7%,transparent)] bg-[var(--surface-soft)] px-4 py-4"
              style={{ ["--index" as string]: index }}
            >
              <p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                {section.label}
              </p>
              <div className="mt-3 text-sm leading-7 text-[var(--foreground)]">{section.value}</div>
            </div>
          ))}
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

  const fetchSnapshot = async () => {
    const response = await fetch(`/api/notes/${noteId}`, {
      method: "GET",
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as NoteApiResponse | null;

    if (!response.ok || !payload?.ok || !payload.note || !payload.processingStatus) {
      throw new Error(payload?.message || "Could not refresh note knowledge.");
    }

    const nextKnowledge = payload.note.linkedNoteKnowledge || payload.note.noteKnowledge || null;
    setKnowledge(nextKnowledge);
    setProcessingStatus(payload.processingStatus);

    if (nextKnowledge && !hasRefreshedServerRef.current) {
      hasRefreshedServerRef.current = true;
      router.refresh();
    }
  };

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
  }, [knowledge, processingStatus.state, noteId]);

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
          <KnowledgeFailedCard processingStatus={processingStatus} onRefresh={() => void handleRefresh()} />
        ) : !knowledge ? (
          <KnowledgeLoadingCard processingStatus={processingStatus} onRefresh={() => void handleRefresh()} />
        ) : (
          <KnowledgeReadyCard knowledge={knowledge} />
        )}
    </section>
  );
}
