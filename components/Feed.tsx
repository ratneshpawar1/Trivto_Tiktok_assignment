"use client";

import { useEffect, useRef } from "react";
import { useFeed } from "@/hooks/useFeed";
import { useLikes } from "@/hooks/useLikes";
import { FeedSlide } from "./FeedSlide";
import { Loading } from "./states/Loading";
import { Empty } from "./states/Empty";
import { ErrorState } from "./states/ErrorState";
import styles from "./Feed.module.css";

export function Feed() {
  const { items, isLoadingInitial, isLoadingMore, error, hasMore, loadMore, retry } =
    useFeed();
  const { isLiked, toggle } = useLikes();

  const containerRef = useRef<HTMLUListElement | null>(null);
  const sentinelRef = useRef<HTMLLIElement | null>(null);

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

  // --- gated states -----------------------------------------------------------
  if (isLoadingInitial) return <Loading />;
  if (error && items.length === 0) {
    return <ErrorState error={error} onRetry={retry} />;
  }
  if (items.length === 0) return <Empty />;

  return (
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
        {!hasMore && !isLoadingMore && !error && <span>You&apos;re all caught up</span>}
      </li>
    </ul>
  );
}
