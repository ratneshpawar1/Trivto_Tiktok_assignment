"use client";

import { useCallback, useEffect, useState } from "react";
import type { LikesResponse, LikeToggleResponse } from "@/types";

export interface UseLikes {
  isLiked: (id: string) => boolean;
  /** Optimistically toggle, then persist; rolls back if the request fails. */
  toggle: (id: string) => void;
}

export function useLikes(): UseLikes {
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  // Hydrate from the server on mount so likes survive a hard refresh.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/likes");
        if (!res.ok) return;
        const data: LikesResponse = await res.json();
        if (!cancelled) setLikedIds(new Set(data.likedIds));
      } catch {
        // Non-fatal: start with an empty set; toggles still work.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isLiked = useCallback((id: string) => likedIds.has(id), [likedIds]);

  const toggle = useCallback((id: string) => {
    const setLiked = (liked: boolean) =>
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (liked) next.add(id);
        else next.delete(id);
        return next;
      });

    let wasLiked = false;
    setLikedIds((prev) => {
      wasLiked = prev.has(id);
      const next = new Set(prev);
      if (wasLiked) next.delete(id);
      else next.add(id);
      return next; // optimistic update
    });

    (async () => {
      try {
        const res = await fetch(`/api/likes/${id}`, { method: "POST" });
        if (!res.ok) throw new Error("toggle failed");
        // Reconcile to the server's reported truth.
        const data: LikeToggleResponse = await res.json();
        setLiked(data.liked);
      } catch {
        setLiked(wasLiked); // roll back to pre-click state
      }
    })();
  }, []);

  return { isLiked, toggle };
}
