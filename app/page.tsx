import type { CSSProperties, ComponentType, ReactNode } from "react";
import Link from "next/link";
import {
  ArchiveIcon,
  ArrowRightIcon,
  Component1Icon,
  ReaderIcon,
} from "@radix-ui/react-icons";
import { Button } from "@/components/ui/Button";

export default function HomePage() {
  return (
    <div className="space-y-24 pb-16 md:space-y-32">
      <section className="grid gap-12 py-10 md:py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] lg:items-end">
        <div className="reveal max-w-4xl space-y-8" style={revealIndex(0)}>
          <div className="inline-flex items-center rounded-[999px] bg-[var(--pastel-green)] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--pastel-green-text)]">
            <span>Browser-first research capture</span>
          </div>
          <div className="space-y-5">
            <h1 className="font-editorial max-w-4xl text-5xl font-semibold leading-[0.98] tracking-[-0.045em] text-[var(--foreground)] md:text-7xl">
              Capture the margin note before the thread is gone.
            </h1>
            <p className="max-w-[64ch] text-base leading-8 text-[var(--muted-foreground)] md:text-lg">
              openPinna keeps the source URL, selected passage, and your raw
              thought in one quiet workspace. The MVP is manual by design; AI
              structure, extension capture, voice, and research memory come
              after the note model proves itself.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/notes/new">
                Create note <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/notes">View notes</Link>
            </Button>
          </div>
        </div>

        <div className="reveal" style={revealIndex(1)}>
          <ResearchWindow />
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-[1.35fr_0.65fr]">
        <FeatureBlock
          icon={ReaderIcon}
          title="Source context stays attached"
          tone="blue"
          className="md:min-h-72"
          index={0}
        >
          Save the URL, page title, selected text, and the thought that made the
          source worth keeping. Future browser extension capture will reuse this
          same path.
        </FeatureBlock>
        <FeatureBlock
          icon={Component1Icon}
          title="AI-ready without fake AI"
          tone="yellow"
          index={1}
        >
          The fake structuring function writes placeholder summary, usefulness,
          and purpose fields so the data shape is ready for real synthesis.
        </FeatureBlock>
        <FeatureBlock
          icon={ArchiveIcon}
          title="A quiet archive for messy research"
          tone="green"
          className="md:col-span-2"
          index={2}
        >
          Tags, timestamps, and source-backed notes keep early research usable
          before search, embeddings, and graph features exist.
        </FeatureBlock>
      </section>
    </div>
  );
}

function ResearchWindow() {
  return (
    <div className="border border-[var(--border)] bg-[rgba(17,17,17,0.03)] p-2 shadow-[0_24px_80px_-72px_rgba(17,17,17,0.4)]">
      <div className="border border-[var(--border)] bg-white">
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-[#dedbd3]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#dedbd3]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#dedbd3]" />
          <span className="font-mono-ui ml-auto text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            draft 01
          </span>
        </div>
        <div className="space-y-5 p-5 md:p-7">
          <div className="space-y-2">
            <p className="font-mono-ui text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              Selected passage
            </p>
            <p className="border-l border-[var(--border)] pl-4 text-sm leading-7 text-[#3f3d39]">
              The useful note is not just the quote. It is the quote, the
              source, and the question that appeared while reading.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_0.72fr]">
            <div className="border border-[var(--border)] bg-[#fbfbfa] p-4">
              <p className="font-medium tracking-[-0.01em]">Reader thought</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                Compare this with the memory retrieval section in the April
                paper.
              </p>
            </div>
            <div className="border border-[var(--border)] bg-white p-4">
              <p className="font-mono-ui text-[11px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                Placeholder structure
              </p>
              <div className="mt-4 space-y-2">
                <div className="h-2 w-5/6 bg-[var(--muted)]" />
                <div className="h-2 w-2/3 bg-[var(--muted)]" />
                <div className="h-2 w-4/5 bg-[var(--muted)]" />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {["context", "literature", "follow-up"].map((tag) => (
              <span
                key={tag}
                className="rounded-[999px] bg-[var(--pastel-blue)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--pastel-blue-text)]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureBlock({
  icon: Icon,
  title,
  children,
  tone,
  className,
  index,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  children: ReactNode;
  tone: "blue" | "green" | "yellow";
  className?: string;
  index: number;
}) {
  const toneClass = {
    blue: "bg-[var(--pastel-blue)] text-[var(--pastel-blue-text)]",
    green: "bg-[var(--pastel-green)] text-[var(--pastel-green-text)]",
    yellow: "bg-[var(--pastel-yellow)] text-[var(--pastel-yellow-text)]",
  }[tone];

  return (
    <article
      className={`reveal border border-[var(--border)] bg-white p-8 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:translate-y-[-2px] hover:shadow-[0_2px_8px_rgba(17,17,17,0.04)] md:p-10 ${className ?? ""}`}
      style={revealIndex(index)}
    >
      <div
        className={`inline-flex h-10 w-10 items-center justify-center rounded-[8px] ${toneClass}`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <h2 className="mt-8 max-w-xl text-2xl font-semibold tracking-[-0.03em]">
        {title}
      </h2>
      <p className="mt-4 max-w-[66ch] text-sm leading-7 text-[var(--muted-foreground)]">
        {children}
      </p>
    </article>
  );
}

function revealIndex(index: number): CSSProperties {
  return { "--index": index } as CSSProperties;
}
