"use client";

import { useEffect, type RefObject } from "react";

/**
 * Arrow-key navigation for a snap-scroll container: ArrowDown/ArrowUp move to
 * the next/previous slide. Shared by the Feed and Liked views.
 *
 * `enabled` lets a mounted-but-hidden view (e.g. the Feed behind the Liked view)
 * opt out, so only the visible view responds to the keys.
 */
export function useArrowKeyNav(
  containerRef: RefObject<HTMLElement | null>,
  count: number,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;
    const root = containerRef.current;
    if (!root) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const slideHeight = root.clientHeight || 1;
      const current = Math.round(root.scrollTop / slideHeight);
      const dir = e.key === "ArrowDown" ? 1 : -1;
      const target = Math.max(0, Math.min(current + dir, count - 1));
      const mql =
        typeof window.matchMedia === "function"
          ? window.matchMedia("(prefers-reduced-motion: reduce)")
          : null;
      const reduceMotion = !!mql && mql.matches;
      root.scrollTo({
        top: target * slideHeight,
        behavior: reduceMotion ? "auto" : "smooth",
      });
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [containerRef, count, enabled]);
}
