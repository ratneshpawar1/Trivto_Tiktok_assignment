"use client";

import { useRef, useState } from "react";
import type { FeedImage } from "@/types";
import { LikeButton } from "./LikeButton";
import styles from "./FeedSlide.module.css";

interface Props {
  image: FeedImage;
  liked: boolean;
  onToggleLike: () => void;
}

type Status = "loading" | "loaded" | "error";

const DOUBLE_TAP_MS = 300;

const HEART_PATH =
  "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z";

export function FeedSlide({ image, liked, onToggleLike }: Props) {
  const [status, setStatus] = useState<Status>("loading");
  const [attempt, setAttempt] = useState(0);
  const [burst, setBurst] = useState(0);
  const lastTapRef = useRef(0);

  const src =
    attempt === 0
      ? image.srcUrl
      : `${image.srcUrl}${image.srcUrl.includes("?") ? "&" : "?"}retry=${attempt}`;

  const retry = () => {
    setStatus("loading");
    setAttempt((a) => a + 1);
  };

  // Double-tap / double-click anywhere on the slide toggles the like. Manual
  // timing (rather than onDoubleClick) so touch double-taps work too. Show the
  // heart burst only when the tap results in a like, not an un-like.
  const handleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      lastTapRef.current = 0;
      if (!liked) setBurst((b) => b + 1);
      onToggleLike();
    } else {
      lastTapRef.current = now;
    }
  };

  return (
    <li
      className={styles.slide}
      data-testid="feed-slide"
      data-id={image.id}
      onClick={handleTap}
      onDoubleClick={(e) => e.preventDefault()}
    >
      {/* Blurred backdrop fills the letterbox around the capped column. */}
      {image.thumbUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- see note below
        <img className={styles.backdrop} src={image.thumbUrl} alt="" aria-hidden="true" />
      )}

      <div className={styles.frame}>
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
            <button
              type="button"
              className={styles.fallbackRetry}
              onClick={(e) => {
                e.stopPropagation();
                retry();
              }}
            >
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

        {burst > 0 && (
          <div key={burst} className={styles.burst} aria-hidden="true">
            <svg
              className={styles.burstIcon}
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d={HEART_PATH} />
            </svg>
          </div>
        )}
      </div>
    </li>
  );
}
