import styles from "./states.module.css";

export function Loading() {
  return (
    <div className={styles.center} role="status" aria-live="polite">
      <div className={styles.box}>
        <div className={styles.spinner} aria-hidden="true" />
        <p className={styles.muted}>Loading photos…</p>
      </div>
    </div>
  );
}
