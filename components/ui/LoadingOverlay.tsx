"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

type LoadingOverlayProps = {
  active: boolean;
  label?: string;
  fullScreen?: boolean;
  zIndexClass?: string;
};

export function LoadingOverlay({
  active,
  label = "Loading...",
  fullScreen = true,
  zIndexClass = "z-[70]",
}: LoadingOverlayProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!active) return null;

  const overlay = (
    <div
      className={`${fullScreen ? "fixed" : "absolute"} inset-0 ${zIndexClass} flex items-center justify-center bg-[color-mix(in_srgb,var(--background)_72%,transparent)] backdrop-blur-lg`}
      aria-live="polite"
      aria-busy="true"
      role="status"
    >
      <div className="flex flex-col items-center gap-3 rounded-[16px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_84%,transparent)] px-6 py-5 shadow-[0_18px_42px_-28px_rgba(10,10,10,0.48)]">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-[color-mix(in_srgb,var(--foreground)_26%,transparent)] border-t-[var(--foreground)]" />
        <p className="text-sm text-[var(--muted-foreground)]">{label}</p>
      </div>
    </div>
  );

  if (fullScreen && mounted) {
    return createPortal(overlay, document.body);
  }

  return overlay;
}
