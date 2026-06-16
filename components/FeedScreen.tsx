"use client";

import { useState } from "react";
import { useLikes } from "@/hooks/useLikes";
import { Feed } from "./Feed";
import { LikedView } from "./LikedView";
import styles from "./FeedScreen.module.css";

type View = "feed" | "liked";

export function FeedScreen() {
  // One likes instance shared by both views so membership stays in sync.
  const likes = useLikes();
  const [view, setView] = useState<View>("feed");

  return (
    <>
      <nav className={styles.tabs} aria-label="Feed views">
        <button
          type="button"
          className={styles.tab}
          aria-pressed={view === "feed"}
          onClick={() => setView("feed")}
        >
          Feed
        </button>
        <button
          type="button"
          className={styles.tab}
          aria-pressed={view === "liked"}
          onClick={() => setView("liked")}
        >
          Liked
          {likes.likedCount > 0 && (
            <span className={styles.count}>{likes.likedCount}</span>
          )}
        </button>
      </nav>

      {/* Feed stays mounted (preserves scroll/loaded pages); the Liked view
          mounts on demand so it always reflects the current likes. */}
      <div className={view === "feed" ? styles.view : styles.hidden}>
        <Feed likes={likes} active={view === "feed"} />
      </div>
      {view === "liked" && <LikedView likes={likes} />}
    </>
  );
}
