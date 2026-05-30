"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";

type PinnaSeed = {
  id: string;
  question: string;
  title?: string | null;
  messages?: Array<{ id: string; role: string; content: string }>;
};

type PinnaNode = {
  id: string;
  question: string;
  x: number;
  y: number;
  title?: string | null;
  messages: Array<{ id: string; role: string; content: string }>;
};

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function NotePinnaBoard({
  centralIdea,
  initialThreads,
}: {
  centralIdea: string;
  initialThreads: PinnaSeed[];
}) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const previousSceneRef = useRef<{ width: number; height: number } | null>(null);
  const zoomInLimit = 1.05;
  const [nodes, setNodes] = useState<PinnaNode[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 });
  const sceneWidth = boardSize.width > 0 ? boardSize.width / zoom : 0;
  const sceneHeight = boardSize.height > 0 ? boardSize.height / zoom : 0;
  const nodeWidth = Math.min(360, Math.max(240, sceneWidth * 0.18));
  const nodeHeight = Math.min(230, Math.max(170, sceneHeight * 0.2));

  useEffect(() => {
    const next = initialThreads.slice(0, 5).map((thread, index) => ({
      id: thread.id,
      question: thread.title || thread.question,
      title: thread.title,
      x: 60 + index * 48,
      y: 48 + index * 42,
      messages: thread.messages || [],
    }));

    setNodes(next);
  }, [initialThreads]);

  useEffect(() => {
    if (sceneWidth <= 0 || sceneHeight <= 0) return;

    const previous = previousSceneRef.current;
    previousSceneRef.current = { width: sceneWidth, height: sceneHeight };
    if (!previous) return;

    const scaleX = sceneWidth / Math.max(1, previous.width);
    const scaleY = sceneHeight / Math.max(1, previous.height);

    setNodes((current) =>
      current.map((node) => {
        const scaledX = node.x * scaleX;
        const scaledY = node.y * scaleY;
        return {
          ...node,
          x: Math.min(Math.max(12, scaledX), Math.max(12, sceneWidth - nodeWidth - 12)),
          y: Math.min(Math.max(12, scaledY), Math.max(12, sceneHeight - nodeHeight - 12)),
        };
      }),
    );
  }, [sceneHeight, sceneWidth, nodeHeight, nodeWidth, zoom]);

  useEffect(() => {
    if (!boardRef.current) return;

    const observer = new ResizeObserver(([entry]) => {
      setBoardSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });

    observer.observe(boardRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{
        thread?: { id: string; threadType?: string; title?: string | null; messages?: Array<{ id: string; role: string; content: string }> };
      }>;
      const thread = custom.detail?.thread;
      if (!thread?.id) return;
      const question = thread.title || thread.threadType || "Pinna";

      setNodes((current) => {
        const angle = current.length * 0.8;
        const radius = Math.min(220, Math.max(120, sceneWidth * 0.18));
        const cx = sceneWidth / 2 + Math.cos(angle) * radius;
        const cy = sceneHeight / 2 + Math.sin(angle) * radius;

        return [
          ...current,
          {
            id: thread.id,
            question,
            title: thread.title || question,
            x: Math.max(24, cx - nodeWidth / 2),
            y: Math.max(24, cy - nodeHeight / 2),
            messages: thread.messages || [],
          },
        ];
      });
    };

    window.addEventListener("add-pinna", handler as EventListener);
    return () => window.removeEventListener("add-pinna", handler as EventListener);
  }, [nodeHeight, nodeWidth, sceneHeight, sceneWidth]);

  useEffect(() => {
    if (!boardRef.current) return;

    const board = boardRef.current;
    nodes.forEach((node) => {
      const element = board.querySelector<HTMLElement>(`[data-pinna-id='${node.id}']`);
      if (!element) return;

      d3.select(element).call(
        d3
          .drag<HTMLElement, unknown>()
          .on("drag", (event) => {
            const pointer = event.sourceEvent as MouseEvent | PointerEvent | undefined;
            const rect = board.getBoundingClientRect();
            const localX = pointer ? (pointer.clientX - rect.left) / zoom : event.x / zoom;
            const localY = pointer ? (pointer.clientY - rect.top) / zoom : event.y / zoom;
            const x = Math.min(
              Math.max(12, localX - nodeWidth / 2),
              Math.max(12, sceneWidth - nodeWidth - 12),
            );
            const y = Math.min(
              Math.max(12, localY - nodeHeight / 2),
              Math.max(12, sceneHeight - nodeHeight - 12),
            );

            setNodes((current) =>
              current.map((entry) => (entry.id === node.id ? { ...entry, x, y } : entry)),
            );
          }),
      );
    });
  }, [nodes, sceneHeight, sceneWidth, zoom]);

  useEffect(() => {
    if (!activeNodeId) {
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
  }, [activeNodeId]);

  const activeNode = useMemo(() => nodes.find((node) => node.id === activeNodeId) || null, [nodes, activeNodeId]);

  const central = {
    x: sceneWidth / 2,
    y: sceneHeight / 2,
  };

  const line = d3
    .line<{ x: number; y: number }>()
    .x((d) => d.x)
    .y((d) => d.y)
    .curve(d3.curveBasis);

  function resizeComposer() {
    const element = inputRef.current;
    if (!element) return;
    element.style.height = "auto";
    const next = Math.min(element.scrollHeight, 96);
    element.style.height = `${next}px`;
  }

  useEffect(() => {
    if (!activeNodeId) return;
    requestAnimationFrame(() => resizeComposer());
  }, [activeNodeId]);

  return (
    <>
      <div ref={boardRef} className="relative mt-6 min-h-[680px] overflow-hidden border border-[var(--border)] bg-[var(--surface-soft)] p-8">
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: sceneWidth || boardSize.width,
            height: sceneHeight || boardSize.height,
            transform: `scale(${zoom})`,
          }}
        >
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            {nodes.map((node) => {
              const nx = node.x + nodeWidth / 2;
              const ny = node.y + nodeHeight / 2;
              const d = line([
                { x: central.x, y: central.y },
                { x: (central.x + nx) / 2, y: central.y },
                { x: (central.x + nx) / 2, y: ny },
                { x: nx, y: ny },
              ]);
              return <path key={`line-${node.id}`} d={d || ""} fill="none" stroke="color-mix(in srgb, var(--foreground) 24%, transparent)" strokeWidth="1.4" strokeDasharray="5 7" />;
            })}
          </svg>

          <div className="absolute left-1/2 top-1/2 w-[340px] -translate-x-1/2 -translate-y-1/2 border border-[var(--border)] bg-[var(--surface)] p-5">
            <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Central idea</p>
            <p className="mt-2 text-sm leading-7">{centralIdea}</p>
          </div>

          {nodes.map((node, index) => (
            <button
              key={node.id}
              type="button"
              data-pinna-id={node.id}
              onClick={() => setActiveNodeId(node.id)}
              className="absolute border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition-colors duration-200 hover:bg-[var(--surface-soft)] active:scale-[0.98]"
              style={{
                left: node.x,
                top: node.y,
                width: nodeWidth,
                height: nodeHeight,
                animationDelay: `${index * 80}ms`,
              }}
            >
              <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Pinna</p>
              <h3 className="mt-2 text-base font-semibold leading-6">{node.question}</h3>
              <p className="mt-2 line-clamp-3 text-xs text-[var(--muted-foreground)]">Drag to reposition. Click to open chat.</p>
            </button>
          ))}
        </div>

        <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2 border border-[var(--border)] bg-[var(--surface)] p-2">
          <button
            type="button"
            className="h-9 w-9 border border-[var(--border)] bg-[var(--surface-soft)] text-base leading-none transition-colors hover:bg-[var(--surface)]"
            onClick={() => setZoom((current) => current * 0.85)}
            aria-label="Zoom out canvas"
          >
            -
          </button>
          <span className="min-w-12 text-center font-mono-ui text-[11px] tracking-[0.08em] text-[var(--muted-foreground)]">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            className="h-9 w-9 border border-[var(--border)] bg-[var(--surface-soft)] text-base leading-none transition-colors hover:bg-[var(--surface)] disabled:opacity-45"
            onClick={() => setZoom((current) => Math.min(zoomInLimit, current * 1.15))}
            disabled={zoom >= zoomInLimit}
            aria-label="Zoom in canvas"
          >
            +
          </button>
        </div>
      </div>

      {activeNode ? (
        <div
          className="fixed inset-0 z-40 bg-[var(--overlay-bg)]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setActiveNodeId(null);
            }
          }}
        >
          <div className="mx-auto flex h-full max-w-[1600px] items-center justify-center px-4 py-6 sm:px-6">
            <div className="h-[80dvh] w-[80vw] min-w-[320px] max-w-[1400px] rounded-[28px] border border-white/20 bg-[rgba(242,242,242,0.72)] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.34)] backdrop-blur-3xl dark:bg-[rgba(24,22,19,0.7)] sm:p-7">
              <LoadingOverlay active={sending} label="Pinna is responding..." fullScreen={false} zIndexClass="z-10" />
              <div className="mb-5 flex items-start justify-between border-b border-[var(--border)]/70 pb-5">
                <div>
                  <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Pinna chat</p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">{activeNode.question}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveNodeId(null)}
                  className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-xs tracking-[0.08em] transition-colors hover:bg-[var(--surface)]"
                >
                  Close
                </button>
              </div>

              <div className="grid h-[calc(100%-88px)] min-h-0 grid-cols-1 gap-4 lg:grid-cols-[1.7fr_1fr]">
                <div className="flex min-h-0 flex-col border border-[var(--border)] bg-[rgba(233,233,233,0.66)] p-4 backdrop-blur-2xl dark:bg-[rgba(31,28,24,0.68)]">
                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 sm:pr-2">
                    {activeNode.messages.map((message) => (
                      <div
                        key={message.id}
                        className={`max-w-[78%] whitespace-pre-wrap break-words rounded-[20px] px-4 py-2.5 text-sm leading-6 sm:px-5 sm:text-[15px] ${
                          message.role === "user"
                            ? "ml-auto bg-[var(--pastel-blue)] text-[var(--pastel-blue-text)]"
                            : "mr-auto border border-[var(--border)] bg-[var(--surface-soft)] text-[var(--foreground)]"
                        }`}
                      >
                        {message.content}
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 shrink-0 flex items-end gap-3 border-t border-[var(--border)] pt-5">
                    <textarea
                      ref={inputRef}
                      value={draftMessage}
                      onChange={(event) => {
                        setDraftMessage(event.target.value);
                        resizeComposer();
                      }}
                      onInput={resizeComposer}
                      rows={1}
                      placeholder="Ask this pinna..."
                      className="min-h-12 max-h-24 w-full resize-none overflow-y-auto rounded-[16px] border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3 text-sm leading-6 outline-none sm:text-[15px]"
                    />
                    <button
                      type="button"
                      className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface-soft)] text-[var(--foreground)] transition-colors hover:bg-[var(--surface)]"
                      aria-label="Voice input"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
                        <path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" fill="none" stroke="currentColor" strokeWidth="1.7" />
                        <path d="M6.5 11a5.5 5.5 0 0 0 11 0M12 16.5V21M9 21h6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      disabled={sending}
                      className="btn-primary h-12 shrink-0 rounded-[14px] px-5 text-sm disabled:opacity-60 sm:px-6 sm:text-[15px]"
                      onClick={async () => {
                        const messagePayload = draftMessage.replace(/\r\n/g, "\n").trimEnd();
                        if (!messagePayload.trim()) return;
                        setSending(true);
                        setNodes((current) =>
                          current.map((node) =>
                            node.id === activeNode.id
                              ? {
                                  ...node,
                                  messages: [
                                    ...node.messages,
                                    { id: uid(), role: "user", content: messagePayload },
                                  ],
                                }
                              : node,
                          ),
                        );
                        setDraftMessage("");
                        requestAnimationFrame(resizeComposer);

                        try {
                          const response = await fetch(`/api/threads/${activeNode.id}/messages`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ userMessage: messagePayload }),
                          });
                          const payload = await response.json();
                          const assistantContent =
                            payload?.assistantMessage?.content ||
                            (response.ok
                              ? "Response completed."
                              : payload?.message || "Pinna response failed.");

                          setNodes((current) =>
                            current.map((node) =>
                              node.id === activeNode.id
                                ? {
                                    ...node,
                                    messages: [
                                      ...node.messages,
                                      {
                                        id: payload?.assistantMessage?.id || uid(),
                                        role: "assistant",
                                        content: assistantContent,
                                      },
                                    ],
                                  }
                                : node,
                            ),
                          );
                        } catch {
                          setNodes((current) =>
                            current.map((node) =>
                              node.id === activeNode.id
                                ? {
                                    ...node,
                                    messages: [
                                      ...node.messages,
                                      {
                                        id: uid(),
                                        role: "assistant",
                                        content: "Network error while sending to pinna.",
                                      },
                                    ],
                                  }
                                : node,
                            ),
                          );
                        } finally {
                          setSending(false);
                        }
                      }}
                    >
                      {sending ? "Sending..." : "Send"}
                    </button>
                  </div>
                </div>

                <aside className="min-h-0 overflow-y-auto border border-[var(--border)] bg-[var(--surface)] p-4">
                  <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Knowledge build</p>
                  <h4 className="mt-2 text-lg font-semibold tracking-[-0.02em]">Mock summary update</h4>
                  <div className="mt-4 space-y-3 text-sm leading-7 text-[var(--muted-foreground)]">
                    <p>
                      Base summary: <span className="text-[var(--foreground)]">{centralIdea.slice(0, 120)}</span>
                    </p>
                    <p>
                      Conversation suggests this idea should be tested with concrete evidence and one counter-example before being promoted to session memory.
                    </p>
                    <p>
                      Proposed note summary (mock): The claim is promising but requires verification against conflicting interpretations and applied examples.
                    </p>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
