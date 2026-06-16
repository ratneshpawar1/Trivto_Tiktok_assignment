"use client";

import styles from "./LikeButton.module.css";

interface Props {
  liked: boolean;
  onToggle: () => void;
}

export function LikeButton({ liked, onToggle }: Props) {
  return (
    <button
      type="button"
      className={styles.button}
      aria-pressed={liked}
      aria-label={liked ? "Unlike photo" : "Like photo"}
      onClick={(e) => {
        // Don't let a button tap count toward the slide's double-tap detector.
        e.stopPropagation();
        onToggle();
      }}
    >
      <svg
        className={styles.icon}
        viewBox="0 0 24 24"
        aria-hidden="true"
        fill={liked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    </button>
  );
}
