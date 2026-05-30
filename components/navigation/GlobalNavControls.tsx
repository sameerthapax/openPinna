"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Cross2Icon, PlusIcon } from "@radix-ui/react-icons";
import { createPortal } from "react-dom";
import { ThemeModeToggle } from "@/components/navigation/ThemeModeToggle";

type CreateScope = "project" | "session" | "note";

function parsePath(pathname: string) {
  const projectMatch = pathname.match(/^\/notes\/([^/]+)$/);
  const sessionMatch = pathname.match(/^\/notes\/([^/]+)\/sessions\/([^/]+)$/);
  const noteMatch = pathname.match(/^\/notes\/([^/]+)\/sessions\/([^/]+)\/notes\/([^/]+)$/);

  if (noteMatch) return { projectId: noteMatch[1], sessionId: noteMatch[2], scope: "note" as CreateScope };
  if (sessionMatch) return { projectId: sessionMatch[1], sessionId: sessionMatch[2], scope: "note" as CreateScope };
  if (projectMatch) return { projectId: projectMatch[1], sessionId: null, scope: "session" as CreateScope };
  return { projectId: null, sessionId: null, scope: "project" as CreateScope };
}

function parentPath(pathname: string) {
  const noteMatch = pathname.match(/^\/notes\/([^/]+)\/sessions\/([^/]+)\/notes\/([^/]+)$/);
  if (noteMatch) return `/notes/${noteMatch[1]}/sessions/${noteMatch[2]}`;
  const sessionMatch = pathname.match(/^\/notes\/([^/]+)\/sessions\/([^/]+)$/);
  if (sessionMatch) return `/notes/${sessionMatch[1]}`;
  const projectMatch = pathname.match(/^\/notes\/([^/]+)$/);
  if (projectMatch) return "/notes";
  return null;
}

export function GlobalNavControls() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pinnaMenuOpen, setPinnaMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const { projectId, sessionId, scope } = useMemo(() => parsePath(pathname), [pathname]);
  const backHref = useMemo(() => parentPath(pathname), [pathname]);
  const isNoteDetail = useMemo(
    () => /^\/notes\/[^/]+\/sessions\/[^/]+\/notes\/[^/]+$/.test(pathname),
    [pathname],
  );
  const pinnaQuestions = [
    "Why does this claim matter?",
    "How would this work in practice?",
    "Is this actually true?",
    "What is the strongest counterpoint?",
    "What should I do with this insight?",
  ];

  useEffect(() => {
    setMounted(true);
    const openModal = () => setOpen(true);
    window.addEventListener("open-create-modal", openModal);
    return () => window.removeEventListener("open-create-modal", openModal);
  }, []);

  useEffect(() => {
    if (!open) {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      document.body.classList.remove("modal-open");
      return;
    }

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.classList.add("modal-open");

    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      document.body.classList.remove("modal-open");
    };
  }, [open]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const form = new FormData(event.currentTarget);

    try {
      if (scope === "project") {
        await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: form.get("title"), description: form.get("description") }),
        });
      } else if (scope === "session" && projectId) {
        await fetch(`/api/projects/${projectId}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: form.get("title"), sessionDate: form.get("sessionDate"), summary: form.get("summary") }),
        });
      } else if (scope === "note" && sessionId) {
        await fetch(`/api/sessions/${sessionId}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.get("title"),
            body: form.get("body"),
            sourceUrl: form.get("sourceUrl"),
            sourceTitle: form.get("sourceTitle"),
            selectedText: form.get("selectedText"),
            tags: form.get("tags"),
          }),
        });
      }

      setOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
        <ThemeModeToggle />
        {backHref ? <Link href={backHref} className="rounded-[6px] px-3 py-2 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]">Back</Link> : null}
        {isNoteDetail ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setPinnaMenuOpen((current) => !current)}
              className="rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-[var(--surface-soft)] active:scale-[0.98]"
            >
              + Add Pinna
            </button>
            {pinnaMenuOpen ? (
              <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-[320px] border border-[var(--border)] bg-[var(--surface)] p-2">
                {pinnaQuestions.map((question) => (
                  <button
                    key={question}
                    type="button"
                    className="block w-full border border-transparent px-3 py-2 text-left text-sm transition-colors hover:border-[var(--border)] hover:bg-[var(--surface-soft)]"
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent("add-pinna", { detail: { question } }),
                      );
                      setPinnaMenuOpen(false);
                    }}
                  >
                    {question}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <button type="button" onClick={() => setOpen(true)} className="btn-primary inline-flex items-center gap-2 rounded-[6px] px-3 py-2 font-medium transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98]">
          <PlusIcon className="h-4 w-4" />
          New
        </button>
      </div>

      {mounted && open
        ? createPortal(
            <div
              className="fixed inset-0 z-30 bg-[var(--overlay-bg)] backdrop-blur-[3px]"
              onMouseDown={() => setOpen(false)}
            >
              <div className="mx-auto flex h-full max-w-7xl justify-center px-4 pt-[104px] pb-8">
                <div
                  className="max-h-[calc(100dvh-140px)] w-full max-w-xl overflow-y-auto border border-[var(--border)] bg-[var(--surface)] p-6"
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-mono-ui text-[11px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">{scope === "project" ? "Create project" : scope === "session" ? "Create session" : "Create note"}</p>
                    <button type="button" onClick={() => setOpen(false)} className="rounded-[6px] p-2 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-[var(--muted)] focus-visible:focus-ring"><Cross2Icon className="h-4 w-4" /></button>
                  </div>
                  <form onSubmit={submit} className="mt-4 space-y-3">
                    <input name="title" required placeholder={scope === "note" ? "Note title" : scope === "session" ? "Session title" : "Project title"} className="w-full border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm outline-none placeholder:text-[var(--muted-foreground)] focus-visible:focus-ring" />
                    {scope === "project" ? <textarea name="description" placeholder="Brief scope" className="min-h-24 w-full border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm outline-none placeholder:text-[var(--muted-foreground)] focus-visible:focus-ring" /> : null}
                    {scope === "session" ? <><input name="sessionDate" type="date" required className="w-full border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm outline-none placeholder:text-[var(--muted-foreground)] focus-visible:focus-ring" /><textarea name="summary" placeholder="Session summary" className="min-h-20 w-full border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm outline-none placeholder:text-[var(--muted-foreground)] focus-visible:focus-ring" /></> : null}
                    {scope === "note" ? <><textarea name="body" required placeholder="Captured knowledge" className="min-h-24 w-full border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm outline-none placeholder:text-[var(--muted-foreground)] focus-visible:focus-ring" /><input name="sourceUrl" placeholder="Source URL" className="w-full border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm outline-none placeholder:text-[var(--muted-foreground)] focus-visible:focus-ring" /><input name="sourceTitle" placeholder="Source title" className="w-full border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm outline-none placeholder:text-[var(--muted-foreground)] focus-visible:focus-ring" /><textarea name="selectedText" placeholder="Selected text" className="min-h-20 w-full border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm outline-none placeholder:text-[var(--muted-foreground)] focus-visible:focus-ring" /><input name="tags" placeholder="tag1, tag2" className="w-full border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm outline-none placeholder:text-[var(--muted-foreground)] focus-visible:focus-ring" /></> : null}
                    <button disabled={submitting} type="submit" className="btn-primary mt-2 rounded-[6px] px-3 py-2 text-sm font-medium disabled:opacity-70">{submitting ? "Saving..." : "Save"}</button>
                  </form>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
