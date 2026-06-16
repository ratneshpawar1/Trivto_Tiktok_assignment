"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  FeedImage,
  LikesResponse,
  LikesFullResponse,
  LikeToggleResponse,
} from "@/types";

export interface UseLikes {
  isLiked: (id: string) => boolean;
  likedCount: number;
  /** Optimistically toggle, then persist; rolls back if the request fails.
   *  Pass the image when liking so it can appear in the Liked view. */
  toggle: (id: string, image?: FeedImage) => void;
  /** Load the full liked images (for the Liked view) and sync membership. */
  fetchLikedImages: () => Promise<FeedImage[]>;
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

  const toggle = useCallback((id: string, image?: FeedImage) => {
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
        const res = await fetch(`/api/likes/${id}`, {
          method: "POST",
          headers: image ? { "content-type": "application/json" } : undefined,
          body: image ? JSON.stringify({ image }) : undefined,
        });
        if (!res.ok) throw new Error("toggle failed");
        const data: LikeToggleResponse = await res.json();
        setLiked(data.liked); // reconcile to server truth
      } catch {
        setLiked(wasLiked); // roll back to pre-click state
      }
    })();
  }, []);

  const fetchLikedImages = useCallback(async (): Promise<FeedImage[]> => {
    const res = await fetch("/api/likes?full=1");
    if (!res.ok) throw new Error("failed to load liked images");
    const data: LikesFullResponse = await res.json();
    setLikedIds(new Set(data.likedIds)); // keep membership in sync
    return data.items;
  }, []);

  return { isLiked, likedCount: likedIds.size, toggle, fetchLikedImages };
}
