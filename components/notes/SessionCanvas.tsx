import type { CSSProperties } from "react";
import Link from "next/link";

type TimelineNote = {
  id: string;
  title: string;
  body: string;
  capturedAt: Date;
};

const STEP_Y = 178;
const START_Y = 42;
const CARD_W = 420;
const CARD_H = 142;
const LINE_X = 92;

function connectorPath(from: { x: number; y: number }, to: { x: number; y: number }) {
  const c1y = from.y + 42;
  const c2y = to.y - 42;
  return `M ${from.x} ${from.y} C ${from.x} ${c1y}, ${to.x} ${c2y}, ${to.x} ${to.y}`;
}

export function SessionCanvas({
  projectId,
  sessionId,
  notes,
}: {
  projectId: string;
  sessionId: string;
  notes: TimelineNote[];
}) {
  const sorted = [...notes].sort(
    (a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime(),
  );

  const nodes = sorted.map((note, index) => {
    const y = START_Y + index * STEP_Y;
    const x = 164;

    return {
      ...note,
      x,
      y,
      dotX: LINE_X,
      dotY: y + CARD_H / 2,
      anchorX: x,
      anchorY: y + CARD_H / 2,
    };
  });

  const mapHeight = Math.max(460, nodes.length * STEP_Y + 64);

  return (
    <div className="mt-8 border border-[var(--border)] bg-[var(--surface-soft)] p-6">
      <div className="relative overflow-y-auto" style={{ height: Math.min(mapHeight, 620) }}>
        <div className="relative" style={{ height: mapHeight }}>
        <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
          <path
            d={`M ${LINE_X} ${START_Y} L ${LINE_X} ${Math.max(START_Y + 120, mapHeight - 28)}`}
            fill="none"
            stroke="color-mix(in srgb, var(--foreground) 16%, transparent)"
            strokeWidth="1"
            strokeDasharray="3 6"
          />

          {nodes.slice(1).map((node, index) => {
            const previous = nodes[index];
            return (
              <path
                key={`${previous.id}-${node.id}`}
                d={connectorPath(
                  { x: previous.dotX, y: previous.dotY },
                  { x: node.dotX, y: node.dotY },
                )}
                fill="none"
                stroke="color-mix(in srgb, var(--foreground) 22%, transparent)"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeDasharray="4 6"
              />
            );
          })}

          {nodes.map((node) => (
            <path
              key={`branch-${node.id}`}
              d={connectorPath(
                { x: node.dotX, y: node.dotY },
                { x: node.anchorX, y: node.anchorY },
              )}
              fill="none"
              stroke="color-mix(in srgb, var(--foreground) 24%, transparent)"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          ))}
        </svg>

        {nodes.map((node) => (
          <div
            key={`dot-${node.id}`}
            className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--foreground)]/45 bg-[var(--surface)]"
            style={{ left: node.dotX, top: node.dotY }}
          />
        ))}

        {nodes.map((node, index) => (
          <Link
            key={node.id}
            href={`/notes/${projectId}/sessions/${sessionId}/notes/${node.id}`}
            className="reveal absolute block border border-[var(--border)] bg-[var(--surface)] p-4 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:scale-[1.02]"
            style={{ left: node.x, top: node.y, width: CARD_W, minHeight: CARD_H, "--index": index } as CSSProperties}
          >
            <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              {new Date(node.capturedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            <h3 className="mt-2 text-base font-semibold tracking-[-0.02em]">{node.title}</h3>
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--muted-foreground)]">
              {node.body}
            </p>
          </Link>
        ))}
        </div>
      </div>
    </div>
  );
}
