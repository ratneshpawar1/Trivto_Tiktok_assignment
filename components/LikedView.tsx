"use client";

import { useEffect, useRef, useState } from "react";
import type { FeedImage } from "@/types";
import type { UseLikes } from "@/hooks/useLikes";
import { useArrowKeyNav } from "@/hooks/useArrowKeyNav";
import { FeedSlide } from "./FeedSlide";
import { Loading } from "./states/Loading";
import { ErrorState } from "./states/ErrorState";
import feedStyles from "./Feed.module.css";
import styles from "./LikedView.module.css";

export function LikedView({ likes }: { likes: UseLikes }) {
  const { isLiked, toggle, fetchLikedImages } = likes;
  const [items, setItems] = useState<FeedImage[] | null>(null);
  const [failed, setFailed] = useState(false);
  const containerRef = useRef<HTMLUListElement | null>(null);

  // Drop anything the user has since un-liked so it disappears immediately.
  const visible = (items ?? []).filter((img) => isLiked(img.id));
  useArrowKeyNav(containerRef, visible.length);

  useEffect(() => {
    let active = true;
    fetchLikedImages()
      .then((imgs) => active && setItems(imgs))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [fetchLikedImages]);

  if (failed) {
    return (
      <ErrorState
        error={{ kind: "generic" }}
        onRetry={() => {
          setFailed(false);
          setItems(null);
          fetchLikedImages()
            .then(setItems)
            .catch(() => setFailed(true));
        }}
      />
    );
  }
  if (items === null) return <Loading />;

  if (visible.length === 0) {
    return (
      <div className={styles.empty} role="status">
        <div className={styles.emptyBox}>
          <p className={styles.emptyTitle}>No liked photos yet</p>
          <p className={styles.emptyHint}>
            Double-tap a photo or tap the heart to like it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul ref={containerRef} className={feedStyles.feed} data-testid="liked-feed">
      {visible.map((image) => (
        <FeedSlide
          key={image.id}
          image={image}
          liked={isLiked(image.id)}
          onToggleLike={() => toggle(image.id, image)}
        />
      ))}
    </ul>
  );
}
