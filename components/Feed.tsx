"use client";

import { useEffect, useRef, useState } from "react";
import { useFeed } from "@/hooks/useFeed";
import { useLikes } from "@/hooks/useLikes";
import { FeedSlide } from "./FeedSlide";
import { Loading } from "./states/Loading";
import { Empty } from "./states/Empty";
import { ErrorState } from "./states/ErrorState";
import styles from "./Feed.module.css";

// Per-session key for remembering which image the user was on, so a refresh
// returns there instead of jumping to the top.
const SCROLL_KEY = "feed:index";
// Safety cap on how many extra pages we'll auto-load to reach a deep saved
// position before giving up.
const MAX_RESTORE_TRIES = 15;

function readSavedIndex(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.sessionStorage.getItem(SCROLL_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function Feed() {
  const { items, isLoadingInitial, isLoadingMore, error, hasMore, loadMore, retry } =
    useFeed();
  const { isLiked, toggle } = useLikes();

  const containerRef = useRef<HTMLUListElement | null>(null);
  const sentinelRef = useRef<HTMLLIElement | null>(null);

  // Scroll restoration across refresh.
  const restoredRef = useRef(false);
  const restoreTriesRef = useRef(0);
  // Initialized from storage so the overlay is correct on the first render
  // (no mount-effect setState). SSR-safe: readSavedIndex returns 0 on server.
  const [restoring, setRestoring] = useState(() => readSavedIndex() > 0);
  const hasItems = items.length > 0;

  // Trigger the next page a couple of viewports BEFORE the bottom so the user
  // never sees the end of the loaded content (no end-of-feed jank).
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = containerRef.current;
    if (!sentinel || !root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { root, rootMargin: "0px 0px 200% 0px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  // Arrow-key navigation for desktop review: snap to the next/previous slide.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const slideHeight = root.clientHeight || 1;
      const current = Math.round(root.scrollTop / slideHeight);
      const dir = e.key === "ArrowDown" ? 1 : -1;
      const target = Math.max(0, Math.min(current + dir, items.length - 1));
      const reduceMotion = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      root.scrollTo({
        top: target * slideHeight,
        behavior: reduceMotion ? "auto" : "smooth",
      });
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length]);

  // Restore the saved image index, loading more pages if the user was deep.
  useEffect(() => {
    if (restoredRef.current) return;
    const root = containerRef.current;
    if (!root) return;

    const savedIndex = readSavedIndex();
    if (savedIndex <= 0) {
      restoredRef.current = true;
      return; // overlay already false (lazy init)
    }

    const haveTarget = items.length - 1 >= savedIndex;
    const giveUp = !hasMore || restoreTriesRef.current >= MAX_RESTORE_TRIES;

    if (haveTarget || giveUp) {
      const slideHeight = root.clientHeight || 1;
      const targetIndex = Math.min(savedIndex, items.length - 1);
      root.scrollTop = targetIndex * slideHeight;
      restoredRef.current = true;
      // Defer out of the effect body to avoid a synchronous cascading render.
      queueMicrotask(() => setRestoring(false));
    } else if (!isLoadingMore) {
      restoreTriesRef.current += 1;
      loadMore();
    }
  }, [items.length, hasMore, isLoadingMore, loadMore]);

  // Persist the current image index as the user scrolls.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const slideHeight = root.clientHeight || 1;
        const index = Math.round(root.scrollTop / slideHeight);
        try {
          window.sessionStorage.setItem(SCROLL_KEY, String(index));
        } catch {
          // storage unavailable (private mode quota) — non-fatal
        }
      });
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [hasItems]);

  // --- gated states -----------------------------------------------------------
  if (isLoadingInitial) return <Loading />;
  if (error && items.length === 0) {
    return <ErrorState error={error} onRetry={retry} />;
  }
  if (items.length === 0) return <Empty />;

  return (
    <>
      {restoring && <Loading />}
      <ul ref={containerRef} className={styles.feed} data-testid="feed">
        {items.map((image) => (
          <FeedSlide
            key={image.id}
            image={image}
            liked={isLiked(image.id)}
            onToggleLike={() => toggle(image.id)}
          />
        ))}

        <li ref={sentinelRef} className={styles.footer} data-testid="sentinel">
          {isLoadingMore && (
            <span
              className={styles.moreSpinner}
              role="status"
              aria-label="Loading more photos"
            />
          )}
          {error && items.length > 0 && (
            <ErrorState error={error} onRetry={retry} inline />
          )}
          {!hasMore && !isLoadingMore && !error && (
            <span>You&apos;re all caught up</span>
          )}
        </li>
      </ul>
    </>
  );
}
