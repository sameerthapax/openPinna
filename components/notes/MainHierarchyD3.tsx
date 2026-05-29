"use client";

import { useEffect } from "react";
import * as d3 from "d3";

type SessionLink = {
  sessionId: string;
  noteIds: string[];
};

export function MainHierarchyD3({
  canvasId,
  sessionLinks,
}: {
  canvasId: string;
  sessionLinks: SessionLink[];
}) {
  useEffect(() => {
    const root = document.getElementById(canvasId);
    if (!root) {
      return;
    }

    const svg = root.querySelector("svg[data-role='d3-main-links']") as SVGSVGElement | null;
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

      const connectors: Array<{ id: string; d: string; kind: "project-session" | "session-note" }> = [];

      const project = root.querySelector<HTMLElement>("[data-node='project-card']");
      if (!project) {
        return;
      }

      const pRect = project.getBoundingClientRect();
      const projectAnchor = {
        x: pRect.right - frame.left,
        y: pRect.top - frame.top + pRect.height / 2,
      };

      for (const session of sessionLinks) {
        const dot = root.querySelector<HTMLElement>(`[data-node='session-dot'][data-session-id='${session.sessionId}']`);
        if (!dot) {
          continue;
        }
        const dRect = dot.getBoundingClientRect();
        const dotAnchor = {
          x: dRect.left - frame.left + dRect.width / 2,
          y: dRect.top - frame.top + dRect.height / 2,
        };

        const pPath = pathFor([
          projectAnchor,
          { x: projectAnchor.x + 64, y: projectAnchor.y },
          { x: dotAnchor.x - 36, y: dotAnchor.y },
          dotAnchor,
        ]);
        if (pPath) {
          connectors.push({ id: `ps-${session.sessionId}`, d: pPath, kind: "project-session" });
        }

        for (const noteId of session.noteIds) {
          const note = root.querySelector<HTMLElement>(`[data-node='note-card'][data-note-id='${noteId}']`);
          if (!note) {
            continue;
          }
          const nRect = note.getBoundingClientRect();
          const noteAnchor = {
            x: nRect.left - frame.left,
            y: nRect.top - frame.top + nRect.height / 2,
          };

          const nPath = pathFor([
            dotAnchor,
            { x: dotAnchor.x + 36, y: dotAnchor.y },
            { x: noteAnchor.x - 34, y: noteAnchor.y },
            noteAnchor,
          ]);

          if (nPath) {
            connectors.push({ id: `sn-${session.sessionId}-${noteId}`, d: nPath, kind: "session-note" });
          }
        }
      }

      const selection = d3
        .select(svg)
        .selectAll<SVGPathElement, (typeof connectors)[number]>("path")
        .data(connectors, (d) => d.id)
        .join("path")
        .attr("d", (d) => d.d)
        .attr("fill", "none")
        .attr("stroke-linecap", "round")
        .attr(
          "stroke",
          (d) =>
            d.kind === "project-session"
              ? `color-mix(in srgb, ${foreground} 32%, transparent)`
              : `color-mix(in srgb, ${foreground} 24%, transparent)`,
        )
        .attr("stroke-width", (d) => (d.kind === "project-session" ? 1.4 : 1.2))
        .attr("stroke-dasharray", (d) => (d.kind === "project-session" ? null : "4 5"));

      selection.order();
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(root);
    window.addEventListener("resize", draw);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", draw);
    };
  }, [canvasId, sessionLinks]);

  return <svg data-role="d3-main-links" className="pointer-events-none absolute inset-0" aria-hidden="true" />;
}
