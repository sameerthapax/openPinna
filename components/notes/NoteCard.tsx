import Link from "next/link";
import type { CSSProperties } from "react";
import { ExternalLinkIcon } from "@radix-ui/react-icons";
import type { ResearchNoteRecord } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export function NoteCard({
  note,
  index = 0,
}: {
  note: ResearchNoteRecord;
  index?: number;
}) {
  return (
    <article
      className="reveal border border-[var(--border)] bg-white p-6 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:translate-y-[-2px] hover:shadow-[0_2px_8px_rgba(17,17,17,0.04)] md:p-7"
      style={{ "--index": index } as CSSProperties}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-2">
          <h2 className="text-xl font-semibold tracking-[-0.03em]">
            {note.title}
          </h2>
          <Link
            href={note.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full items-center gap-1 truncate text-sm text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
          >
            {note.sourceTitle || note.sourceUrl}
            <ExternalLinkIcon className="h-3.5 w-3.5 shrink-0" />
          </Link>
        </div>
        <time className="font-mono-ui shrink-0 text-[11px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
          {formatDateTime(note.createdAt)}
        </time>
      </div>

      {note.selectedText ? (
        <blockquote className="mt-5 border-l border-[var(--border)] pl-4 text-sm leading-7 text-[var(--muted-foreground)]">
          {note.selectedText}
        </blockquote>
      ) : null}

      <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-[#3f3d39]">
        {note.rawThought}
      </p>

      {note.structuredSummary ? (
        <div className="mt-5 border border-[var(--border)] bg-[#fbfbfa] p-4 text-sm leading-7 text-[var(--muted-foreground)]">
          <p className="font-mono-ui text-[11px] uppercase tracking-[0.14em] text-[var(--foreground)]">
            AI structure
          </p>
          <p className="mt-1">{note.structuredSummary}</p>
        </div>
      ) : null}

      {note.tags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {note.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-[999px] bg-[var(--pastel-green)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--pastel-green-text)]"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
