import styles from "./states.module.css";

export function Empty() {
  return (
    <div className={styles.center} role="status">
      <div className={styles.box}>
        <p className={styles.title}>No photos yet</p>
        <p className={styles.muted}>There&apos;s nothing in the feed right now.</p>
      </div>
    </div>
  );
}
