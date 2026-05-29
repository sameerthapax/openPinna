"use client";

import { useEffect } from "react";
import * as d3 from "d3";

type SessionNotes = {
  sessionId: string;
  noteIds: string[];
};

export function ProjectCanvasD3({
  canvasId,
  sessionNotes,
}: {
  canvasId: string;
  sessionNotes: SessionNotes[];
}) {
  useEffect(() => {
    const root = document.getElementById(canvasId);
    if (!root) {
      return;
    }

    const svg = root.querySelector("svg[data-role='d3-project-links']") as SVGSVGElement | null;
    if (!svg) {
      return;
    }

    const pathFor = d3.line<{ x: number; y: number }>()
      .x((d) => d.x)
      .y((d) => d.y)
      .curve(d3.curveBasis);

    const draw = () => {
      const css = getComputedStyle(root);
      const foreground = css.getPropertyValue("--foreground").trim() || "#111111";
      const frame = root.getBoundingClientRect();
      svg.setAttribute("width", String(frame.width));
      svg.setAttribute("height", String(frame.height));

      const connectors: Array<{ id: string; d: string }> = [];

      for (const row of sessionNotes) {
        const session = root.querySelector<HTMLElement>(`[data-node='session-card'][data-session-id='${row.sessionId}']`);
        if (!session) {
          continue;
        }

        const sRect = session.getBoundingClientRect();
        const sessionAnchor = {
          x: sRect.right - frame.left,
          y: sRect.top - frame.top + sRect.height / 2,
        };

        for (const noteId of row.noteIds) {
          const note = root.querySelector<HTMLElement>(`[data-node='note-card'][data-note-id='${noteId}']`);
          if (!note) {
            continue;
          }

          const nRect = note.getBoundingClientRect();
          const noteAnchor = {
            x: nRect.left - frame.left,
            y: nRect.top - frame.top + nRect.height / 2,
          };

          const path = pathFor([
            sessionAnchor,
            { x: sessionAnchor.x + 52, y: sessionAnchor.y },
            { x: noteAnchor.x - 40, y: noteAnchor.y },
            noteAnchor,
          ]);

          if (path) {
            connectors.push({ id: `${row.sessionId}-${noteId}`, d: path });
          }
        }
      }

      d3.select(svg)
        .selectAll<SVGPathElement, (typeof connectors)[number]>("path")
        .data(connectors, (d) => d.id)
        .join("path")
        .attr("d", (d) => d.d)
        .attr("fill", "none")
        .attr("stroke", `color-mix(in srgb, ${foreground} 24%, transparent)`)
        .attr("stroke-width", 1.2)
        .attr("stroke-linecap", "round")
        .attr("stroke-dasharray", "4 6");
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(root);
    window.addEventListener("resize", draw);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", draw);
    };
  }, [canvasId, sessionNotes]);

  return <svg data-role="d3-project-links" className="pointer-events-none absolute inset-0" aria-hidden="true" />;
}
