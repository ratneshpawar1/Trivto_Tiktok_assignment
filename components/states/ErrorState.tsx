import type { FeedError } from "@/hooks/useFeed";
import styles from "./states.module.css";

interface Props {
  error: FeedError;
  onRetry: () => void;
  /** Compact variant for an inline "load more failed" footer. */
  inline?: boolean;
}

export function ErrorState({ error, onRetry, inline = false }: Props) {
  const isRateLimited = error.kind === "rate_limited";
  const title = isRateLimited ? "Too many requests" : "Something went wrong";
  const detail = isRateLimited
    ? error.retryAfter
      ? `We're being rate limited. Try again in about ${error.retryAfter}s.`
      : "We're being rate limited. Please try again shortly."
    : "We couldn't load the feed. Check your connection and try again.";

  return (
    <div
      className={inline ? undefined : styles.center}
      role="alert"
      data-error-kind={error.kind}
    >
      <div className={styles.box}>
        <p className={styles.title}>{title}</p>
        <p className={styles.muted}>{detail}</p>
        <button type="button" className={styles.retry} onClick={onRetry}>
          Retry
        </button>
      </div>
    </div>
  );
}
