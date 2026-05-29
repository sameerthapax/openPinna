import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowLeftIcon } from "@radix-ui/react-icons";
import { NoteForm } from "@/components/notes/NoteForm";

export default function NewNotePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-16">
      <Link
        href="/notes"
        className="reveal inline-flex items-center gap-2 rounded-[6px] px-2 py-1 text-sm text-[var(--muted-foreground)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back to notes
      </Link>
      <div
        className="reveal space-y-4"
        style={{ "--index": 1 } as CSSProperties}
      >
        <div className="inline-flex rounded-[999px] bg-[var(--pastel-yellow)] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--pastel-yellow-text)]">
          New source-backed thought
        </div>
        <h1 className="font-editorial text-5xl font-semibold leading-none tracking-[-0.045em] md:text-6xl">
          Create research note
        </h1>
        <p className="max-w-[62ch] text-base leading-8 text-[var(--muted-foreground)]">
          Save source context, selected text, and the thought you want to keep.
        </p>
      </div>
      <NoteForm />
    </div>
  );
}
