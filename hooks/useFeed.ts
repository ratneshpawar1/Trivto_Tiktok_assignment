"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedImage, FeedResponse } from "@/types";

export type FeedErrorKind = "rate_limited" | "generic";

export interface FeedError {
  kind: FeedErrorKind;
  retryAfter?: number;
}

export interface UseFeed {
  items: FeedImage[];
  /** True only while the very first page is loading (nothing on screen yet). */
  isLoadingInitial: boolean;
  /** True while a subsequent page is loading (items already on screen). */
  isLoadingMore: boolean;
  error: FeedError | null;
  hasMore: boolean;
  /** Ask for the next page (no-op if at the end or a fetch is in flight). */
  loadMore: () => void;
  /** Retry the page that just failed. */
  retry: () => void;
}

async function parseError(res: Response): Promise<FeedError> {
  let body: { error?: string; retryAfter?: number } = {};
  try {
    body = await res.json();
  } catch {
    // ignore — fall through to status-based classification
  }
  const isRateLimited = res.status === 503 || body.error === "rate_limited";
  return {
    kind: isRateLimited ? "rate_limited" : "generic",
    retryAfter: body.retryAfter,
  };
}

export function useFeed(): UseFeed {
  const [items, setItems] = useState<FeedImage[]>([]);
  const [nextPage, setNextPage] = useState<number | null>(1);
  // Starts true: page 1 always loads on mount, so the very first render should
  // show the loading state, never a flash of the empty state.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FeedError | null>(null);

  // Refs guard against duplicate in-flight fetches and stale closures inside
  // the IntersectionObserver callback.
  const inFlight = useRef(false);
  const seenIds = useRef<Set<string>>(new Set());
  const lastAttempted = useRef<number>(1);

  const loadPage = useCallback(async (page: number) => {
    if (inFlight.current) return;
    inFlight.current = true;
    lastAttempted.current = page;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/feed?page=${page}`);
      if (!res.ok) {
        setError(await parseError(res));
        return;
      }
      const data: FeedResponse = await res.json();

      // De-dupe by id so an overlapping page never renders the same image twice.
      const fresh = data.items.filter((img) => !seenIds.current.has(img.id));
      fresh.forEach((img) => seenIds.current.add(img.id));
      if (fresh.length > 0) setItems((prev) => [...prev, ...fresh]);
      setNextPage(data.nextPage);
    } catch {
      setError({ kind: "generic" });
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  // Initial page load. Deferred to a microtask so the fetch's first setState
  // doesn't run synchronously inside the effect body (avoids cascading renders
  // / react-hooks/set-state-in-effect). It still fires right after commit, so
  // there is no perceptible delay.
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void loadPage(1);
    });
    return () => {
      active = false;
    };
  }, [loadPage]);

  const loadMore = useCallback(() => {
    if (inFlight.current || error || nextPage === null) return;
    void loadPage(nextPage);
  }, [error, nextPage, loadPage]);

  const retry = useCallback(() => {
    void loadPage(lastAttempted.current);
  }, [loadPage]);

  return {
    items,
    isLoadingInitial: loading && items.length === 0,
    isLoadingMore: loading && items.length > 0,
    error,
    hasMore: nextPage !== null,
    loadMore,
    retry,
  };
}
