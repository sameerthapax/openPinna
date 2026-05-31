"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";

function isModifiedClick(event: MouseEvent) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

function isInternalNavigation(anchor: HTMLAnchorElement) {
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#")) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;

  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  if (url.pathname === window.location.pathname && url.search === window.location.search) return false;

  return true;
}

export function RouteTransitionOverlay() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [navigating, setNavigating] = useState(false);
  const showDelayRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (showDelayRef.current) {
      window.clearTimeout(showDelayRef.current);
      showDelayRef.current = null;
    }
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setNavigating(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    const setSafetyTimeout = () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => {
        setNavigating(false);
      }, 12000);
    };

    const queueOverlay = () => {
      if (showDelayRef.current) window.clearTimeout(showDelayRef.current);
      showDelayRef.current = window.setTimeout(() => {
        setNavigating(true);
      }, 500);
      setSafetyTimeout();
    };

    const onClickCapture = (event: MouseEvent) => {
      if (isModifiedClick(event)) return;
      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a") as HTMLAnchorElement | null;
      if (!anchor || !isInternalNavigation(anchor)) return;

      queueOverlay();
    };

    const onPopState = () => {
      queueOverlay();
    };

    window.addEventListener("click", onClickCapture, true);
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("click", onClickCapture, true);
      window.removeEventListener("popstate", onPopState);
      if (showDelayRef.current) {
        window.clearTimeout(showDelayRef.current);
      }
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return <LoadingOverlay active={navigating} label="Loading page..." fullScreen zIndexClass="z-[90]" />;
}
