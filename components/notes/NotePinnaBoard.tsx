"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { useThemeMode } from "@/components/navigation/ThemeProvider";
import {
  noteMiniCardClass,
  noteOverlayClass,
  noteSectionClass,
  notePillClass,
} from "@/components/notes/noteTheme";
import { cn } from "@/lib/utils";

type PinnaMessage = {
  id: string;
  role: string;
  content: string;
  createdAt?: string;
};

type PinnaSeed = {
  id: string;
  threadId: string;
  question: string;
  title?: string | null;
  baseVersion?: {
    id: string;
    version: number;
    title: string | null;
  } | null;
  messages?: PinnaMessage[];
  hasOlderMessages?: boolean;
};

type PinnaNode = {
  id: string;
  threadId: string;
  question: string;
  x: number;
  y: number;
  title?: string | null;
  baseVersion?: {
    id: string;
    version: number;
    title: string | null;
  } | null;
  messages: PinnaMessage[];
  hasOlderMessages: boolean;
};

type PinnaLayout = {
  zoom: number;
  nodes: Array<{ id: string; x: number; y: number }>;
};

type SourceDetails = {
  sourceType: string | null;
  title: string | null;
  abstract: string | null;
  authors: string[];
  publicationYear: number | null;
  publicationDate: string | null;
  venue: string | null;
  doi: string | null;
  url: string | null;
  pdfUrl: string | null;
  metadata: Record<string, unknown>;
};

type VoiceRecording = {
  audioId: string;
  audioUrl: string | null;
  mimeType: string | null;
  transcript: string | null;
  durationMs: number | null;
  pageTitle: string | null;
  pageUrl: string | null;
  captureUrl: string | null;
  captureLabel: string | null;
  startedAt: string | null;
};

type KnowledgeSections = {
  keyFindings: string;
  userView: string;
  conclusion: string;
};

type CaptureArtifact = {
  captureUrl: string | null;
  captureLabel: string | null;
  captureBadgeLabel: string | null;
  fileName: string | null;
  artifactType: "screenshot" | "pdf";
};

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString();
}

function formatDuration(durationMs: number | null) {
  if (!durationMs || durationMs <= 0) return null;
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function prettifyMetadataLabel(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stringifyMetadataValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((entry) =>
        typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean"
          ? String(entry)
          : "",
      )
      .filter(Boolean)
      .join(", ");
  }
  return null;
}

function renderChatMessageContent(content: string) {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  return lines.map((line, lineIndex) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);

    return (
      <span key={`line-${lineIndex}`} className="block">
        {parts.map((part, partIndex) => {
          const boldMatch = part.match(/^\*\*([^*]+)\*\*$/);
          if (boldMatch) {
            return (
              <strong key={`part-${lineIndex}-${partIndex}`} className="font-semibold text-[var(--foreground)]">
                {boldMatch[1]}
              </strong>
            );
          }

          return <span key={`part-${lineIndex}-${partIndex}`}>{part}</span>;
        })}
      </span>
    );
  });
}

export function NotePinnaBoard({
  noteId,
  noteTitle,
  noteOpinion,
  noteSummary,
  knowledgeSections,
  sourceDetails,
  voiceRecording,
  captureArtifact,
  initialPinnas,
  initialLayout,
}: {
  noteId: string;
  noteTitle: string;
  noteOpinion: string;
  noteSummary: string;
  knowledgeSections: KnowledgeSections | null;
  sourceDetails: SourceDetails;
  voiceRecording: VoiceRecording | null;
  captureArtifact: CaptureArtifact | null;
  initialPinnas: PinnaSeed[];
  initialLayout?: PinnaLayout | null;
}) {
  const { theme } = useThemeMode();
  const isDarkTheme = theme === "dark";
  const boardRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const previousSceneRef = useRef<{ width: number; height: number } | null>(null);
  const zoomInLimit = 1.05;
  const [nodes, setNodes] = useState<PinnaNode[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [isCentralOpen, setIsCentralOpen] = useState(false);
  const [draftMessage, setDraftMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingPinnaId, setDeletingPinnaId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 });
  const saveLayoutTimeoutRef = useRef<number | null>(null);
  const hasHydratedRef = useRef(false);
  const chatScrollerRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(false);
  const sceneWidth = boardSize.width > 0 ? boardSize.width / zoom : 0;
  const sceneHeight = boardSize.height > 0 ? boardSize.height / zoom : 0;
  const nodeWidth = Math.min(360, Math.max(240, sceneWidth * 0.18));
  const nodeHeight = Math.min(230, Math.max(170, sceneHeight * 0.2));

  useEffect(() => {
    const savedPositions = new Map(
      (initialLayout?.nodes || []).map((entry) => [entry.id, { x: entry.x, y: entry.y }]),
    );
    setNodes((current) => {
      const currentById = new Map(current.map((node) => [node.id, node]));
      const seeded = initialPinnas.map((pinna, index) => {
        const saved = savedPositions.get(pinna.id);
        const existing = currentById.get(pinna.id);

        return {
          id: pinna.id,
          threadId: pinna.threadId,
          question: pinna.title || pinna.question,
          title: pinna.title,
          baseVersion: pinna.baseVersion || null,
          x: existing?.x ?? saved?.x ?? 60 + index * 48,
          y: existing?.y ?? saved?.y ?? 48 + index * 42,
          messages:
            existing && existing.messages.length > 0
              ? existing.messages
              : pinna.messages || [],
          hasOlderMessages:
            existing?.hasOlderMessages ?? Boolean(pinna.hasOlderMessages),
        };
      });

      const seededIds = new Set(seeded.map((node) => node.id));
      const clientOnly = current.filter((node) => !seededIds.has(node.id));
      return [...seeded, ...clientOnly];
    });
    setZoom(initialLayout?.zoom && initialLayout.zoom > 0 ? initialLayout.zoom : 1);
    hasHydratedRef.current = true;
  }, [initialPinnas, initialLayout]);

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
        pinna?: {
          id: string;
          threadId: string;
          threadType?: string;
          title?: string | null;
          baseVersion?: { id: string; version: number; title: string | null } | null;
          messages?: Array<{ id: string; role: string; content: string }>;
        };
      }>;
      const pinna = custom.detail?.pinna;
      if (!pinna?.id) return;
      const question = pinna.title || pinna.threadType || "Pinna";

      setNodes((current) => {
        const existing = current.find((entry) => entry.id === pinna.id);
        if (existing) {
          return current.map((entry) =>
            entry.id === pinna.id
              ? {
                  ...entry,
                  threadId: pinna.threadId,
                  question,
                  title: pinna.title || question,
                  baseVersion: pinna.baseVersion || null,
                  messages: pinna.messages || entry.messages,
                }
              : entry,
          );
        }

        const angle = current.length * 0.8;
        const radius = Math.min(220, Math.max(120, sceneWidth * 0.18));
        const cx = sceneWidth / 2 + Math.cos(angle) * radius;
        const cy = sceneHeight / 2 + Math.sin(angle) * radius;

        return [
          ...current,
          {
            id: pinna.id,
            threadId: pinna.threadId,
            question,
            title: pinna.title || question,
            baseVersion: pinna.baseVersion || null,
            x: Math.max(24, cx - nodeWidth / 2),
            y: Math.max(24, cy - nodeHeight / 2),
            messages: pinna.messages || [],
            hasOlderMessages: false,
          },
        ];
      });
      setActiveNodeId(pinna.id);
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
  }, [nodeHeight, nodeWidth, nodes, sceneHeight, sceneWidth, zoom]);

  useEffect(() => {
    if (!activeNodeId && !isCentralOpen) {
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
  }, [activeNodeId, isCentralOpen]);

  useEffect(() => {
    if (!noteId || !hasHydratedRef.current || nodes.length === 0) return;
    if (saveLayoutTimeoutRef.current) {
      window.clearTimeout(saveLayoutTimeoutRef.current);
    }

    saveLayoutTimeoutRef.current = window.setTimeout(() => {
      const payload = {
        pinnaLayout: {
          zoom,
          nodes: nodes.map((node) => ({ id: node.id, x: node.x, y: node.y })),
        },
      };

      void fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }, 450);

    return () => {
      if (saveLayoutTimeoutRef.current) {
        window.clearTimeout(saveLayoutTimeoutRef.current);
      }
    };
  }, [noteId, nodes, zoom]);

  const activeNode = useMemo(() => nodes.find((node) => node.id === activeNodeId) || null, [nodes, activeNodeId]);
  const sourceMetadataEntries = useMemo(
    () =>
      Object.entries(sourceDetails.metadata || {})
        .map(([key, value]) => ({
          key,
          label: prettifyMetadataLabel(key),
          value: stringifyMetadataValue(value),
        }))
        .filter((entry) => entry.value),
    [sourceDetails.metadata],
  );
  const sourceFacts = useMemo(
    () =>
      [
        sourceDetails.sourceType ? { label: "Source type", value: sourceDetails.sourceType } : null,
        sourceDetails.venue ? { label: "Venue", value: sourceDetails.venue } : null,
        sourceDetails.publicationYear
          ? { label: "Publication year", value: String(sourceDetails.publicationYear) }
          : null,
        formatDate(sourceDetails.publicationDate)
          ? { label: "Publication date", value: formatDate(sourceDetails.publicationDate) as string }
          : null,
        sourceDetails.doi ? { label: "DOI", value: sourceDetails.doi } : null,
      ].filter(Boolean) as Array<{ label: string; value: string }>,
    [sourceDetails],
  );
  const sourceSnapshot = useMemo(
    () =>
      [
        sourceDetails.authors.length > 0
          ? {
              label: "Authors",
              value: sourceDetails.authors.join(", "),
            }
          : null,
        sourceDetails.venue ? { label: "Venue", value: sourceDetails.venue } : null,
        formatDate(sourceDetails.publicationDate)
          ? { label: "Published", value: formatDate(sourceDetails.publicationDate) as string }
          : null,
      ].filter(Boolean) as Array<{ label: string; value: string }>,
    [sourceDetails],
  );

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

  useEffect(() => {
    if (!activeNodeId) return;
    requestAnimationFrame(() => {
      const scroller = chatScrollerRef.current;
      if (!scroller) return;
      scroller.scrollTop = scroller.scrollHeight;
    });
  }, [activeNodeId]);

  useEffect(() => {
    setDeleteError(null);
  }, [activeNodeId]);

  useEffect(() => {
    if (!shouldStickToBottomRef.current) return;
    requestAnimationFrame(() => {
      const scroller = chatScrollerRef.current;
      if (!scroller) return;
      scroller.scrollTop = scroller.scrollHeight;
      shouldStickToBottomRef.current = false;
    });
  }, [activeNode?.messages.length]);

  async function loadOlderMessages(node: PinnaNode) {
    if (loadingOlderMessages || !node.hasOlderMessages || node.messages.length === 0) return;

    const oldestMessage = node.messages[0];
    const beforeCreatedAt = oldestMessage.createdAt || null;
    if (!beforeCreatedAt) return;

    const scroller = chatScrollerRef.current;
    const previousHeight = scroller?.scrollHeight || 0;
    const previousTop = scroller?.scrollTop || 0;
    setLoadingOlderMessages(true);

    try {
      const params = new URLSearchParams({
        limit: "100",
        beforeCreatedAt,
      });
      if (oldestMessage.id) {
        params.set("beforeMessageId", oldestMessage.id);
      }

      const response = await fetch(`/api/threads/${node.threadId}?${params.toString()}`);
      const payload = await response.json();
      const messages: PinnaMessage[] = Array.isArray(payload?.messages)
        ? payload.messages.map((message: PinnaMessage) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            createdAt: message.createdAt,
          }))
        : [];

      if (messages.length > 0) {
        setNodes((current) =>
          current.map((entry) =>
            entry.id === node.id
              ? {
                  ...entry,
                  messages: [...messages, ...entry.messages],
                  hasOlderMessages: Boolean(payload?.pageInfo?.hasOlder),
                }
              : entry,
          ),
        );

        requestAnimationFrame(() => {
          const element = chatScrollerRef.current;
          if (!element) return;
          const nextHeight = element.scrollHeight;
          element.scrollTop = nextHeight - previousHeight + previousTop;
        });
      } else {
        setNodes((current) =>
          current.map((entry) =>
            entry.id === node.id
              ? {
                  ...entry,
                  hasOlderMessages: false,
                }
              : entry,
          ),
        );
      }
    } finally {
      setLoadingOlderMessages(false);
    }
  }

  async function handleDeletePinna(node: PinnaNode) {
    const confirmed = window.confirm(
      "Delete this pinna and its thread history? This will also attempt to delete its Mem0 memory.",
    );
    if (!confirmed) return;

    setDeleteError(null);
    setDeletingPinnaId(node.id);

    try {
      const response = await fetch(`/api/pinnas/${node.id}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message || "Failed to delete pinna.");
      }

      setNodes((current) => current.filter((entry) => entry.id !== node.id));
      setActiveNodeId(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Failed to delete pinna.");
    } finally {
      setDeletingPinnaId(null);
    }
  }

  return (
    <>
      <div
        ref={boardRef}
        className="relative h-[84dvh] min-h-[80dvh] max-h-[90dvh] overflow-hidden rounded-[2rem] border border-[color-mix(in_srgb,var(--foreground)_8%,transparent)] bg-[color-mix(in_srgb,var(--pastel-yellow)_14%,var(--surface))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.52)] md:p-6"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--pastel-yellow-text)_10%,transparent),transparent_34%),radial-gradient(circle_at_bottom_right,color-mix(in_srgb,var(--pastel-green-text)_9%,transparent),transparent_28%)]" />
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

          <button
            type="button"
            className="absolute left-1/2 top-1/2 w-[min(420px,82vw)] -translate-x-1/2 -translate-y-1/2 rounded-[1.9rem] border border-[color-mix(in_srgb,var(--foreground)_9%,transparent)] bg-[color-mix(in_srgb,var(--surface)_84%,var(--pastel-yellow)_16%)] p-6 text-left shadow-[0_28px_60px_-42px_rgba(35,28,18,0.38)] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[var(--surface)] active:scale-[0.99]"
            onClick={() => setIsCentralOpen(true)}
          >
            <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Central note dossier</p>
            <p className="mt-3 text-lg font-semibold leading-8 tracking-[-0.03em] text-[var(--foreground)]">{noteTitle}</p>
            {sourceSnapshot.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {sourceSnapshot.map((fact) => (
                  <span
                    key={fact.label}
                    className="rounded-full bg-[color-mix(in_srgb,var(--pastel-yellow)_28%,var(--surface))] px-3 py-1 font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]"
                  >
                    {fact.label}: {fact.value}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="mt-5 flex items-center justify-between gap-3 border-t border-[color-mix(in_srgb,var(--foreground)_8%,transparent)] pt-4">
              <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                Open full note briefing
              </p>
              <span className="rounded-full bg-[var(--pastel-green)] px-3 py-1 font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--pastel-green-text)]">
                {knowledgeSections ? "Knowledge ready" : "Context pending"}
              </span>
            </div>
          </button>

          {nodes.map((node, index) => (
            <button
              key={node.id}
              type="button"
              data-pinna-id={node.id}
              onClick={() => setActiveNodeId(node.id)}
              className="absolute rounded-[1.55rem] border border-[color-mix(in_srgb,var(--foreground)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface)_92%,var(--pastel-yellow)_8%)] p-4 text-left shadow-[0_18px_44px_-36px_rgba(28,23,16,0.34)] transition-[background-color,transform,box-shadow] duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-[2px] hover:bg-[var(--surface)] active:scale-[0.98]"
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
              <p className="mt-2 line-clamp-2 text-xs text-[var(--muted-foreground)]">
                {node.baseVersion
                  ? `Base v${node.baseVersion.version}. Drag to reposition. Click to open chat.`
                  : "Drag to reposition. Click to open chat."}
              </p>
            </button>
          ))}
        </div>

        <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--foreground)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] p-2 shadow-[0_18px_34px_-28px_rgba(20,16,12,0.28)]">
          <button
            type="button"
            className="h-9 w-9 rounded-full border border-[color-mix(in_srgb,var(--foreground)_8%,transparent)] bg-[var(--surface-soft)] text-base leading-none transition-colors hover:bg-[var(--surface)]"
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
            className="h-9 w-9 rounded-full border border-[color-mix(in_srgb,var(--foreground)_8%,transparent)] bg-[var(--surface-soft)] text-base leading-none transition-colors hover:bg-[var(--surface)] disabled:opacity-45"
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
          className={`${noteOverlayClass} z-[50]`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setActiveNodeId(null);
            }
          }}
        >
          <div className="mx-auto flex h-full max-w-[1700px] items-center justify-center px-4 py-4 sm:px-6 sm:py-5">
            <div
              className={cn(
                "flex h-[88dvh] w-full max-w-[1500px] min-w-0 flex-col rounded-[34px] p-5 backdrop-blur-3xl sm:p-7",
                "border border-[color-mix(in_srgb,var(--foreground)_10%,transparent)] bg-[color-mix(in_srgb,var(--surface)_94%,var(--foreground)_6%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.42),0_44px_110px_-54px_rgba(17,17,17,0.24)]",
              )}
            >
              <div className="mb-5 flex items-start justify-between border-b border-[color-mix(in_srgb,var(--foreground)_8%,transparent)] pb-5">
                <div>
                  <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Pinna chat</p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">{activeNode.question}</h3>
                  {activeNode.baseVersion ? (
                    <p className="mt-2 text-xs uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                      Built from note base version {activeNode.baseVersion.version}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteError(null);
                      setActiveNodeId(null);
                    }}
                    className={cn(
                      "rounded-[16px] px-4 py-2.5 text-xs tracking-[0.08em] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-[1px]",
                      isDarkTheme
                        ? "border border-[rgba(242,239,233,0.12)] bg-[rgba(31,28,24,0.96)] text-[rgba(242,239,233,0.96)] hover:bg-[rgba(42,38,33,0.98)]"
                        : "border border-[rgba(186,170,146,0.14)] bg-[rgba(255,252,247,0.74)] text-[color:#5b4937] hover:bg-[rgba(255,254,250,0.9)]",
                    )}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeletePinna(activeNode)}
                    disabled={deletingPinnaId === activeNode.id}
                    className={cn(
                      "min-w-[128px] rounded-[16px] px-4 py-2.5 text-xs tracking-[0.08em] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-[1px] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60",
                      isDarkTheme
                        ? "border border-[rgba(219,104,104,0.72)] bg-[linear-gradient(180deg,rgba(128,38,38,0.96),rgba(98,27,27,0.96))] text-[color:#fff7f5] shadow-[0_20px_36px_-24px_rgba(108,24,24,0.82)] hover:bg-[linear-gradient(180deg,rgba(146,46,46,0.98),rgba(110,31,31,0.98))]"
                        : "border border-[rgba(159,47,45,0.18)] bg-[rgba(253,235,236,0.9)] text-[color:#9f2f2d] hover:bg-[rgba(253,235,236,1)]",
                    )}
                  >
                    {deletingPinnaId === activeNode.id ? "Deleting..." : "Delete pinna"}
                  </button>
                </div>
              </div>

              <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
                <div
                  className={cn(
                    "flex min-h-0 min-w-0 flex-col rounded-[30px] p-5 backdrop-blur-2xl",
                    noteSectionClass,
                  )}
                >
                  {deleteError ? (
                    <div className={cn("mb-4 rounded-[20px] px-4 py-3 text-sm leading-6", isDarkTheme ? "border border-[rgba(214,114,114,0.28)] bg-[rgba(75,22,22,0.88)] text-[color:#f6cbc7]" : "border border-[rgba(159,47,45,0.18)] bg-[rgba(253,235,236,0.92)] text-[color:#7c2927]")}>
                      {deleteError}
                    </div>
                  ) : null}
                  <div
                    ref={chatScrollerRef}
                    className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 sm:pr-2"
                    onScroll={(event) => {
                      if (
                        event.currentTarget.scrollTop < 80 &&
                        activeNode &&
                        activeNode.hasOlderMessages &&
                        !loadingOlderMessages
                      ) {
                        void loadOlderMessages(activeNode);
                      }
                    }}
                  >
                    {activeNode.hasOlderMessages || loadingOlderMessages ? (
                      <div className="sticky top-0 z-10 flex justify-center py-2">
                        <div className={cn(notePillClass, "px-3 py-1.5")}>
                          {loadingOlderMessages ? "Loading older messages" : "Scroll up for earlier messages"}
                        </div>
                      </div>
                    ) : null}
                    {activeNode.messages.map((message) => (
                      <div
                        key={message.id}
                        className={cn(
                          "max-w-[78%] whitespace-pre-wrap break-words rounded-[28px] px-5 py-3 text-sm leading-7 sm:px-6 sm:text-[15px]",
                          message.role === "user"
                            ? isDarkTheme
                              ? "ml-auto border border-[rgba(84,124,149,0.28)] bg-[linear-gradient(180deg,rgba(28,46,58,0.98),rgba(23,39,49,0.96))] text-[rgba(191,226,244,0.98)] shadow-[0_18px_32px_-28px_rgba(16,27,35,0.78)]"
                              : "ml-auto border border-[rgba(145,170,192,0.14)] bg-[linear-gradient(180deg,rgba(219,233,245,0.98),rgba(205,222,236,0.95))] text-[color:#456989] shadow-[0_18px_36px_-28px_rgba(93,127,156,0.22)]"
                            : isDarkTheme
                              ? "mr-auto border border-[rgba(242,239,233,0.08)] bg-[linear-gradient(180deg,rgba(32,29,26,0.98),rgba(22,20,18,0.96))] text-[rgba(242,239,233,0.96)] shadow-[0_18px_32px_-28px_rgba(0,0,0,0.74)]"
                              : "mr-auto border border-[rgba(196,179,154,0.12)] bg-[linear-gradient(180deg,rgba(255,253,249,0.98),rgba(248,242,233,0.96))] text-[color:#403226] shadow-[0_18px_36px_-28px_rgba(106,82,48,0.12)]",
                        )}
                      >
                        {renderChatMessageContent(message.content)}
                      </div>
                    ))}
                    {sending ? (
                      <div className={cn("mr-auto max-w-[78%] rounded-[28px] px-5 py-3", isDarkTheme ? "border border-[rgba(242,239,233,0.08)] bg-[linear-gradient(180deg,rgba(32,29,26,0.98),rgba(22,20,18,0.96))] text-[rgba(242,239,233,0.96)] shadow-[0_18px_32px_-28px_rgba(0,0,0,0.74)]" : "border border-[rgba(196,179,154,0.12)] bg-[linear-gradient(180deg,rgba(255,253,249,0.98),rgba(248,242,233,0.96))] text-[color:#403226] shadow-[0_18px_36px_-28px_rgba(106,82,48,0.12)]")}>
                        <div className="flex items-center gap-2">
                          <span className={cn("inline-flex h-2.5 w-2.5 animate-[typing-bounce_1s_infinite] rounded-full [animation-delay:-0.2s]", isDarkTheme ? "bg-[color-mix(in_srgb,var(--foreground)_40%,transparent)]" : "bg-[rgba(141,114,76,0.38)]")} />
                          <span className={cn("inline-flex h-2.5 w-2.5 animate-[typing-bounce_1s_infinite] rounded-full [animation-delay:-0.1s]", isDarkTheme ? "bg-[color-mix(in_srgb,var(--foreground)_40%,transparent)]" : "bg-[rgba(141,114,76,0.38)]")} />
                          <span className={cn("inline-flex h-2.5 w-2.5 animate-[typing-bounce_1s_infinite] rounded-full", isDarkTheme ? "bg-[color-mix(in_srgb,var(--foreground)_40%,transparent)]" : "bg-[rgba(141,114,76,0.38)]")} />
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className={cn("mt-5 shrink-0 min-w-0 flex items-end gap-3 pt-5", isDarkTheme ? "border-t border-[rgba(242,239,233,0.1)]" : "border-t border-[var(--border)]")}>
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
                      className={cn(
                        "min-h-12 max-h-24 w-full resize-none overflow-y-auto rounded-[22px] px-5 py-3.5 text-sm leading-6 outline-none sm:text-[15px]",
                        isDarkTheme
                          ? "border border-[rgba(242,239,233,0.1)] bg-[rgba(20,18,16,0.98)] text-[rgba(242,239,233,0.96)] placeholder:text-[rgba(184,177,163,0.78)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                          : "border border-[rgba(196,179,154,0.12)] bg-[rgba(255,252,247,0.88)] text-[color:#3b2e22] placeholder:text-[color:#a48d71] shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]",
                      )}
                    />
                    <button
                      type="button"
                      className={cn(
                        "grid h-12 w-12 shrink-0 place-items-center rounded-full transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-[1px]",
                        isDarkTheme
                          ? "border border-[rgba(242,239,233,0.1)] bg-[rgba(24,22,20,0.98)] text-[rgba(242,239,233,0.92)] hover:bg-[rgba(36,32,29,0.98)]"
                          : "border border-[rgba(196,179,154,0.12)] bg-[rgba(255,252,247,0.86)] text-[color:#6b5641] shadow-[0_14px_28px_-24px_rgba(107,82,47,0.14)] hover:bg-[rgba(252,247,239,0.96)]",
                      )}
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
                        shouldStickToBottomRef.current = true;
                        setNodes((current) =>
                          current.map((node) =>
                            node.id === activeNode.id
                              ? {
                                  ...node,
                                  messages: [
                                    ...node.messages,
                                    {
                                      id: uid(),
                                      role: "user",
                                      content: messagePayload,
                                      createdAt: new Date().toISOString(),
                                    },
                                  ],
                                }
                              : node,
                          ),
                        );
                        setDraftMessage("");
                        requestAnimationFrame(resizeComposer);

                        try {
                          const response = await fetch(`/api/threads/${activeNode.threadId}/messages`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ userMessage: messagePayload }),
                          });
                          const payload = await response.json();
                          const assistantContent = payload?.assistantMessage?.content
                            || (response.ok
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
                                        createdAt:
                                          payload?.assistantMessage?.createdAt ||
                                          new Date().toISOString(),
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
                                        createdAt: new Date().toISOString(),
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
                      {sending ? "Thinking..." : "Send"}
                    </button>
                  </div>
                </div>

                <aside
                  className={cn("min-h-0 min-w-0 overflow-y-auto rounded-[30px] p-5", noteSectionClass)}
                >
                  <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Context spine</p>
                  <h4 className="mt-2 text-lg font-semibold tracking-[-0.02em]">Live note context</h4>
                  <div className="mt-4 space-y-3 text-sm leading-7 text-[var(--muted-foreground)]">
                    <div className={cn(noteMiniCardClass, "rounded-[24px] p-5")}>
                      <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                        Summary
                      </p>
                      <p className="mt-2 text-[var(--foreground)]">
                        {noteSummary || "Knowledge summary is still being prepared."}
                      </p>
                    </div>
                    {knowledgeSections ? (
                      <>
                        <div className={cn(noteMiniCardClass, "rounded-[24px] p-5")}>
                          <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                            Key findings
                          </p>
                          <p className="mt-2 text-[var(--foreground)]">{knowledgeSections.keyFindings}</p>
                        </div>
                        <div className={cn(noteMiniCardClass, "rounded-[24px] p-5")}>
                          <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                            User view
                          </p>
                          <p className="mt-2 text-[var(--foreground)]">{knowledgeSections.userView}</p>
                        </div>
                      </>
                    ) : (
                      <div className={cn(noteMiniCardClass, "rounded-[24px] p-5")}>
                        <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                          Build status
                        </p>
                        <p className="mt-2 text-[var(--foreground)]">
                          OpenPinna is still consolidating the note knowledge for this thread context.
                        </p>
                      </div>
                    )}
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isCentralOpen ? (
        <div
          className={`${noteOverlayClass} z-[45]`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsCentralOpen(false);
            }
          }}
        >
          <div className="mx-auto flex h-full max-w-[1800px] items-center justify-center px-4 py-6 sm:px-6">
            <div
              className={cn(
                "flex h-[90dvh] w-[90vw] min-w-[320px] min-h-0 flex-col rounded-[2rem] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.42),0_30px_80px_-50px_rgba(27,21,14,0.28)] backdrop-blur-3xl sm:p-7",
                "border border-[color-mix(in_srgb,var(--foreground)_10%,transparent)] bg-[color-mix(in_srgb,var(--surface)_94%,var(--foreground)_6%)]",
              )}
            >
              <div className="mb-5 flex items-start justify-between border-b border-[color-mix(in_srgb,var(--foreground)_8%,transparent)] pb-5">
                <div>
                  <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Central note</p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">{noteTitle}</h3>
                  <p className="mt-2 max-w-[64ch] text-sm leading-7 text-[var(--muted-foreground)]">
                    A readable note dossier with provenance, evidence, capture artifacts, and the user&apos;s interpretation in one place.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCentralOpen(false)}
                  className="shrink-0 rounded-full border border-[color-mix(in_srgb,var(--foreground)_8%,transparent)] bg-[var(--surface)] px-4 py-2 text-sm transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-[1px] hover:bg-[var(--surface-soft)] active:scale-[0.98]"
                >
                  Close
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="grid min-h-full grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_360px]">
                  <div className="grid content-start gap-5">
                    <section className={noteSectionClass}>
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                            Source briefing
                          </p>
                          <h4 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
                            {sourceDetails.title || noteTitle}
                          </h4>
                        </div>
                        <span className={notePillClass}>
                          Informative view
                        </span>
                      </div>

                      {sourceDetails.authors.length > 0 ? (
                        <p className="mt-4 text-sm leading-7 text-[var(--muted-foreground)]">
                          {sourceDetails.authors.join(", ")}
                        </p>
                      ) : null}

                      {sourceFacts.length > 0 ? (
                        <div className="mt-5 grid gap-3 md:grid-cols-2">
                          {sourceFacts.map((fact) => (
                            <div
                              key={fact.label}
                              className={noteMiniCardClass}
                            >
                              <p className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                                {fact.label}
                              </p>
                              <p className="mt-1 text-sm leading-6 text-[var(--foreground)]">{fact.value}</p>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </section>

                    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                      <section className={noteSectionClass}>
                        <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                          Summary
                        </p>
                        <div className="mt-4 max-h-[280px] overflow-y-auto pr-1 text-sm leading-8 text-[var(--foreground)]">
                          {noteSummary || "No summary generated yet."}
                        </div>
                      </section>

                      <section className={noteSectionClass}>
                        <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                          My opinion
                        </p>
                        <div className="mt-4 max-h-[280px] overflow-y-auto pr-1 text-sm leading-8 text-[var(--foreground)]">
                          {noteOpinion || "No opinion captured."}
                        </div>
                      </section>
                    </div>

                    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                      <section className={noteSectionClass}>
                        <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                          Abstract
                        </p>
                        <div className="mt-4 max-h-[260px] overflow-y-auto pr-1 text-sm leading-8 text-[var(--foreground)]">
                          {sourceDetails.abstract || "No abstract captured yet."}
                        </div>
                      </section>

                      {sourceMetadataEntries.length > 0 ? (
                        <section className={noteSectionClass}>
                          <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                            Additional metadata
                          </p>
                          <div className="mt-4 max-h-[260px] space-y-3 overflow-y-auto pr-1">
                            {sourceMetadataEntries.map((entry) => (
                              <div
                                key={entry.key}
                                className="rounded-[1.1rem] border border-[color-mix(in_srgb,var(--foreground)_7%,transparent)] bg-[var(--surface)] px-4 py-3"
                              >
                                <p className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                                  {entry.label}
                                </p>
                                <p className="mt-1 text-sm leading-6 text-[var(--foreground)]">{entry.value}</p>
                              </div>
                            ))}
                          </div>
                        </section>
                      ) : null}
                    </div>
                  </div>

                  <aside className={noteSectionClass}>
                    <div className="flex h-full min-h-0 flex-col">
                      <div>
                        <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                          Reference rail
                        </p>
                        <h4 className="mt-3 text-lg font-semibold tracking-[-0.02em] text-[var(--foreground)]">
                          Links and captured media
                        </h4>
                      </div>

                      <div className="mt-5 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                        {(sourceDetails.url || sourceDetails.pdfUrl || sourceDetails.doi) ? (
                          <section className="rounded-[1.4rem] border border-[color-mix(in_srgb,var(--foreground)_7%,transparent)] bg-[var(--surface)] p-4">
                            <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Links</p>
                            <div className="mt-3 grid gap-3">
                              {sourceDetails.url ? (
                                <a
                                  href={sourceDetails.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-[1rem] border border-[color-mix(in_srgb,var(--foreground)_8%,transparent)] px-3 py-2.5 text-sm leading-6 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-[1px] hover:bg-[var(--surface-soft)]"
                                >
                                  Open source page
                                </a>
                              ) : null}
                              {sourceDetails.pdfUrl ? (
                                <a
                                  href={sourceDetails.pdfUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-[1rem] border border-[color-mix(in_srgb,var(--foreground)_8%,transparent)] px-3 py-2.5 text-sm leading-6 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-[1px] hover:bg-[var(--surface-soft)]"
                                >
                                  Open PDF
                                </a>
                              ) : null}
                              {sourceDetails.doi ? (
                                <a
                                  href={`https://doi.org/${sourceDetails.doi}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-[1rem] border border-[color-mix(in_srgb,var(--foreground)_8%,transparent)] px-3 py-2.5 text-sm leading-6 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-[1px] hover:bg-[var(--surface-soft)]"
                                >
                                  Open DOI
                                </a>
                              ) : null}
                            </div>
                          </section>
                        ) : null}

                        {captureArtifact?.captureUrl ? (
                          <section className="rounded-[1.4rem] border border-[color-mix(in_srgb,var(--foreground)_7%,transparent)] bg-[var(--surface)] p-4">
                            <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                              Capture artifact
                            </p>
                            <div className="mt-3 rounded-[1rem] border border-[color-mix(in_srgb,var(--foreground)_8%,transparent)] bg-[color-mix(in_srgb,var(--pastel-yellow)_18%,var(--surface))] p-4">
                              <p className="text-sm font-medium leading-6 text-[var(--foreground)]">
                                {captureArtifact.captureBadgeLabel}
                              </p>
                              <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
                                {captureArtifact.fileName || "Captured artifact"}
                              </p>
                              <a
                                href={captureArtifact.captureUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-3 inline-flex text-sm underline decoration-[var(--border)] underline-offset-4"
                              >
                                {captureArtifact.captureLabel || "Open capture"}
                              </a>
                            </div>
                          </section>
                        ) : null}

                        {voiceRecording ? (
                          <section className="rounded-[1.4rem] border border-[color-mix(in_srgb,var(--foreground)_7%,transparent)] bg-[var(--surface)] p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Voice recording</p>
                                <h4 className="mt-2 text-base font-semibold leading-6">
                                  {voiceRecording.pageTitle || "Captured voice note"}
                                </h4>
                              </div>
                              {formatDuration(voiceRecording.durationMs) ? (
                                <span className="rounded-full bg-[var(--pastel-blue)] px-3 py-1 font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--pastel-blue-text)]">
                                  {formatDuration(voiceRecording.durationMs)}
                                </span>
                              ) : null}
                            </div>
                            {voiceRecording.audioUrl ? (
                              <div className="mt-4 rounded-[1rem] border border-[color-mix(in_srgb,var(--foreground)_8%,transparent)] bg-[var(--surface-soft)] p-3">
                                <audio controls preload="metadata" className="w-full">
                                  <source
                                    src={voiceRecording.audioUrl}
                                    type={voiceRecording.mimeType || "audio/webm"}
                                  />
                                </audio>
                              </div>
                            ) : null}
                            <div className="mt-4 grid gap-2 text-sm leading-6 text-[var(--muted-foreground)]">
                              {voiceRecording.startedAt ? <p>Started: {formatDate(voiceRecording.startedAt)}</p> : null}
                              {voiceRecording.pageUrl ? (
                                <a
                                  href={voiceRecording.pageUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="underline decoration-[var(--border)] underline-offset-4"
                                >
                                  Open captured page
                                </a>
                              ) : null}
                              {voiceRecording.captureUrl && !captureArtifact?.captureUrl ? (
                                <a
                                  href={voiceRecording.captureUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="underline decoration-[var(--border)] underline-offset-4"
                                >
                                  {voiceRecording.captureLabel || "Open capture"}
                                </a>
                              ) : null}
                            </div>
                            {voiceRecording.transcript ? (
                              <div className="mt-4 max-h-[220px] overflow-y-auto rounded-[1rem] border border-[color-mix(in_srgb,var(--foreground)_8%,transparent)] bg-[color-mix(in_srgb,var(--pastel-blue)_16%,var(--surface))] p-3 text-sm leading-7 text-[var(--foreground)]">
                                {voiceRecording.transcript}
                              </div>
                            ) : null}
                          </section>
                        ) : null}
                      </div>
                    </div>
                  </aside>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
