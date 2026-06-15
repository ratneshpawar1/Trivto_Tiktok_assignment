// Tiny in-memory TTL cache. Used to memoize normalized feed pages for ~60s so
// repeated requests don't hammer the upstream rate limit (PLAN §1.2).
// Image URLs from upstream are stable, so caching a page is safe.
//
// This lives in module scope, so it persists for the lifetime of the server
// process. On serverless it's per-instance and best-effort — which is fine for
// a rate-limit cushion (not a correctness requirement).

interface Entry<T> {
  value: T;
  expires: number; // epoch ms
}

export class TTLCache<T> {
  private store = new Map<string, Entry<T>>();
  constructor(private readonly ttlMs: number) {}

  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expires) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, expires: Date.now() + this.ttlMs });
  }

  /** Test helper. */
  clear(): void {
    this.store.clear();
  }
}
