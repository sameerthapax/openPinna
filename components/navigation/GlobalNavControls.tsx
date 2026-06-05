"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Cross2Icon, PlusIcon } from "@radix-ui/react-icons";
import { createPortal } from "react-dom";
import { ThemeModeToggle } from "@/components/navigation/ThemeModeToggle";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";

type CreateScope = "project" | "session" | "note";
type PinnaTemplate = {
  id: string;
  key: string;
  name: string;
  defaultTitle: string | null;
  description: string | null;
};

type BaseVersionOption = {
  id: string;
  version: number;
  title: string | null;
  summary: string | null;
  createdAt: string;
};

function parsePath(pathname: string) {
  const projectMatch = pathname.match(/^\/notes\/([^/]+)$/);
  const sessionMatch = pathname.match(/^\/notes\/([^/]+)\/sessions\/([^/]+)$/);
  const noteMatch = pathname.match(/^\/notes\/([^/]+)\/sessions\/([^/]+)\/notes\/([^/]+)$/);

  if (noteMatch) return { projectId: noteMatch[1], sessionId: noteMatch[2], noteId: noteMatch[3], scope: "note" as CreateScope };
  if (sessionMatch) return { projectId: sessionMatch[1], sessionId: sessionMatch[2], scope: "note" as CreateScope };
  if (projectMatch) return { projectId: projectMatch[1], sessionId: null, noteId: null, scope: "session" as CreateScope };
  return { projectId: null, sessionId: null, noteId: null, scope: "project" as CreateScope };
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
  const [pinnaLoading, setPinnaLoading] = useState(false);
  const [pinnaTemplates, setPinnaTemplates] = useState<PinnaTemplate[]>([]);
  const [pinnaBasePrompt, setPinnaBasePrompt] = useState<{
    template: PinnaTemplate;
    currentVersion: BaseVersionOption | null;
    firstVersion: BaseVersionOption | null;
    versionCount: number;
  } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [sessionExistsMessage, setSessionExistsMessage] = useState("");
  const [todaySessionHref, setTodaySessionHref] = useState<string | null>(null);

  const { projectId, sessionId, noteId, scope } = useMemo(() => parsePath(pathname), [pathname]);
  const backHref = useMemo(() => parentPath(pathname), [pathname]);
  const isNoteDetail = useMemo(
    () => /^\/notes\/[^/]+\/sessions\/[^/]+\/notes\/[^/]+$/.test(pathname),
    [pathname],
  );
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
      setSessionExistsMessage("");
      setTodaySessionHref(null);
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

  useEffect(() => {
    if (!isNoteDetail) return;
    let canceled = false;

    async function loadPinnas() {
      try {
        const response = await fetch("/api/pinna-templates", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        if (!payload?.ok || canceled) return;
        setPinnaTemplates(payload.pinnaTemplates || []);
      } catch {
        // Keep UI resilient if templates endpoint is unavailable.
      }
    }

    loadPinnas();
    return () => {
      canceled = true;
    };
  }, [isNoteDetail]);

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
        const response = await fetch(`/api/projects/${projectId}/sessions/today`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok || !payload?.session?.id) {
          return;
        }

        const href = `/notes/${projectId}/sessions/${payload.session.id}`;
        if (payload.created === false) {
          setSessionExistsMessage("Session for today already exists.");
          setTodaySessionHref(href);
          return;
        }
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

  async function createPinnaFromTemplate(
    template: PinnaTemplate,
    baseSelection: "current" | "first",
  ) {
    if (!noteId || pinnaLoading) return;

    setPinnaLoading(true);
    try {
      const response = await fetch(`/api/notes/${noteId}/threads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pinnaTemplateKey: template.key,
          title: template.defaultTitle || template.name,
          baseSelection,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok || !payload?.pinna || !payload?.thread) return;
      window.dispatchEvent(
        new CustomEvent("add-pinna", {
          detail: {
            pinna: {
              id: payload.pinna.id,
              threadId: payload.thread.id,
              threadType: payload.thread.threadType,
              title: payload.pinna.title || payload.thread.title,
              baseVersion: payload.baseVersion
                ? {
                    id: payload.baseVersion.id,
                    version: payload.baseVersion.version,
                    title: payload.baseVersion.title,
                  }
                : null,
              messages: [],
            },
          },
        }),
      );
    } finally {
      setPinnaLoading(false);
      setPinnaBasePrompt(null);
      setPinnaMenuOpen(false);
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
                {pinnaTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className="block w-full border border-transparent px-3 py-2 text-left text-sm transition-colors hover:border-[var(--border)] hover:bg-[var(--surface-soft)]"
                    onClick={async () => {
                      if (!noteId || pinnaLoading) return;
                      try {
                        const response = await fetch(`/api/notes/${noteId}/threads`, {
                          cache: "no-store",
                        });
                        const payload = await response.json();
                        if (!response.ok || !payload?.ok) return;
                        const versionCount = payload?.baseKnowledge?.versions?.length || 0;
                        if (versionCount > 1) {
                          setPinnaBasePrompt({
                            template,
                            currentVersion: payload.baseKnowledge.currentVersion || null,
                            firstVersion: payload.baseKnowledge.firstVersion || null,
                            versionCount,
                          });
                          setPinnaMenuOpen(false);
                          return;
                        }
                        await createPinnaFromTemplate(template, "current");
                      } catch {
                        setPinnaLoading(false);
                      }
                    }}
                  >
                    <span className="block font-medium text-[var(--foreground)]">
                      {template.defaultTitle || template.name}
                    </span>
                    {template.description ? (
                      <span className="mt-1 block text-xs text-[var(--muted-foreground)]">
                        {template.description}
                      </span>
                    ) : null}
                  </button>
                ))}
                {pinnaTemplates.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-[var(--muted-foreground)]">No pinna templates found.</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        <button type="button" onClick={() => setOpen(true)} className="btn-primary inline-flex items-center gap-2 rounded-[6px] px-3 py-2 font-medium transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98]">
          <PlusIcon className="h-4 w-4" />
          New
        </button>
      </div>

      {mounted ? (
        <LoadingOverlay
          active={submitting || pinnaLoading}
          label={pinnaLoading ? "Creating pinna..." : "Saving..."}
        />
      ) : null}

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
                    {scope !== "session" ? (
                      <input
                        name="title"
                        required
                        placeholder={scope === "note" ? "Note title" : "Project title"}
                        className="w-full border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm outline-none placeholder:text-[var(--muted-foreground)] focus-visible:focus-ring"
                      />
                    ) : null}
                    {scope === "project" ? <textarea name="description" placeholder="Brief scope" className="min-h-24 w-full border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm outline-none placeholder:text-[var(--muted-foreground)] focus-visible:focus-ring" /> : null}
                    {scope === "session" ? (
                      <div className="space-y-3">
                        <p className="text-sm text-[var(--muted-foreground)]">
                          A session for today will be created automatically.
                        </p>
                        {sessionExistsMessage ? (
                          <div className="space-y-2">
                            <p className="text-sm text-[var(--foreground)]">{sessionExistsMessage}</p>
                            {todaySessionHref ? (
                              <button
                                type="button"
                                className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-[var(--surface)]"
                                onClick={() => {
                                  setOpen(false);
                                  router.push(todaySessionHref);
                                }}
                              >
                                Open today&apos;s session
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {scope === "note" ? <><textarea name="body" required placeholder="Captured knowledge" className="min-h-24 w-full border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm outline-none placeholder:text-[var(--muted-foreground)] focus-visible:focus-ring" /><input name="sourceUrl" placeholder="Source URL" className="w-full border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm outline-none placeholder:text-[var(--muted-foreground)] focus-visible:focus-ring" /><input name="sourceTitle" placeholder="Source title" className="w-full border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm outline-none placeholder:text-[var(--muted-foreground)] focus-visible:focus-ring" /><textarea name="selectedText" placeholder="Selected text" className="min-h-20 w-full border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm outline-none placeholder:text-[var(--muted-foreground)] focus-visible:focus-ring" /><input name="tags" placeholder="tag1, tag2" className="w-full border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm outline-none placeholder:text-[var(--muted-foreground)] focus-visible:focus-ring" /></> : null}
                    <button disabled={submitting} type="submit" className="btn-primary mt-2 rounded-[6px] px-3 py-2 text-sm font-medium disabled:opacity-70">{submitting ? "Saving..." : "Save"}</button>
                  </form>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {mounted && pinnaBasePrompt
        ? createPortal(
            <div
              className="fixed inset-0 z-30 bg-[var(--overlay-bg)] backdrop-blur-[3px]"
              onMouseDown={() => setPinnaBasePrompt(null)}
            >
              <div className="mx-auto flex h-full max-w-5xl items-center justify-center px-4 py-8">
                <div
                  className="w-full max-w-3xl rounded-[1.6rem] border border-[color-mix(in_srgb,var(--foreground)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface)_96%,var(--pastel-yellow)_4%)] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.44)]"
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  <div className="flex items-start justify-between gap-4 border-b border-[color-mix(in_srgb,var(--foreground)_8%,transparent)] pb-5">
                    <div>
                      <p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                        Choose base knowledge
                      </p>
                      <h3 className="mt-2 font-editorial text-3xl tracking-[-0.04em] text-[var(--foreground)]">
                        {pinnaBasePrompt.template.defaultTitle || pinnaBasePrompt.template.name}
                      </h3>
                      <p className="mt-2 max-w-[58ch] text-sm leading-7 text-[var(--muted-foreground)]">
                        This note has {pinnaBasePrompt.versionCount} base knowledge versions. Choose which shared note base this pinna should inherit before it begins its own build history.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPinnaBasePrompt(null)}
                      className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs tracking-[0.08em] transition-colors hover:bg-[var(--surface-soft)]"
                    >
                      Close
                    </button>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    {[
                      {
                        key: "current" as const,
                        label: "Current base",
                        tone: "bg-[var(--pastel-green)] text-[var(--pastel-green-text)]",
                        record: pinnaBasePrompt.currentVersion,
                      },
                      {
                        key: "first" as const,
                        label: "First base",
                        tone: "bg-[var(--pastel-yellow)] text-[var(--pastel-yellow-text)]",
                        record: pinnaBasePrompt.firstVersion,
                      },
                    ].map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => void createPinnaFromTemplate(pinnaBasePrompt.template, option.key)}
                        className="group rounded-[1.25rem] border border-[color-mix(in_srgb,var(--foreground)_8%,transparent)] bg-[var(--surface)] p-5 text-left transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-[1px] hover:bg-[var(--surface-soft)] active:scale-[0.98]"
                      >
                        <span className={`inline-flex rounded-full px-3 py-1 font-mono-ui text-[10px] uppercase tracking-[0.16em] ${option.tone}`}>
                          {option.label}
                        </span>
                        <h4 className="mt-4 text-lg font-semibold tracking-[-0.02em] text-[var(--foreground)]">
                          Version {option.record?.version ?? "N/A"}
                        </h4>
                        <p className="mt-2 text-sm leading-7 text-[var(--muted-foreground)]">
                          {option.record?.title || option.record?.summary || "No summary available for this base version."}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
