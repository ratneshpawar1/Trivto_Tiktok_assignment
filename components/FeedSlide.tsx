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

export function FeedSlide({ image, liked, onToggleLike }: Props) {
  const [loaded, setLoaded] = useState(false);

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
          proxy/serve external image URLs directly and manage load/blur state
          ourselves rather than going through the next/image optimizer. */}
      <img
        className={`${styles.image} ${loaded ? styles.loaded : ""}`}
        src={image.srcUrl}
        alt={image.alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
      />

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
