"use client";

import { useState } from "react";
import type { FeedImage } from "@/types";
import { LikeButton } from "./LikeButton";
import styles from "./FeedSlide.module.css";

interface Props {
  image: FeedImage;
  liked: boolean;
  onToggleLike: () => void;
}

type Status = "loading" | "loaded" | "error";

export function FeedSlide({ image, liked, onToggleLike }: Props) {
  const [status, setStatus] = useState<Status>("loading");
  const [attempt, setAttempt] = useState(0);

  // On retry, cache-bust the URL so the browser re-requests instead of serving
  // the failed response from cache.
  const src =
    attempt === 0
      ? image.srcUrl
      : `${image.srcUrl}${image.srcUrl.includes("?") ? "&" : "?"}retry=${attempt}`;

  const retry = () => {
    setStatus("loading");
    setAttempt((a) => a + 1);
  };

  return (
    <li className={styles.slide} data-testid="feed-slide" data-id={image.id}>
      {/* Blur placeholder underneath the full image. */}
      {image.thumbUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- see note below
        <img
          className={styles.placeholder}
          src={image.thumbUrl}
          alt=""
          aria-hidden="true"
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- intentional: we
          serve external image URLs directly and manage load/error/blur state
          ourselves rather than going through the next/image optimizer. */}
      <img
        key={attempt}
        className={`${styles.image} ${status === "loaded" ? styles.loaded : ""}`}
        src={src}
        alt={image.alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
      />

      {status === "error" && (
        <div className={styles.fallback} role="alert">
          <p className={styles.fallbackTitle}>Couldn&apos;t load image</p>
          <button type="button" className={styles.fallbackRetry} onClick={retry}>
            Retry
          </button>
        </div>
      )}

      <div className={styles.scrim} aria-hidden="true" />

      <p className={styles.attribution}>
        {image.author}
        <span>{image.alt}</span>
      </p>

      <div className={styles.controls}>
        <LikeButton liked={liked} onToggle={onToggleLike} />
      </div>
    </li>
  );
}
