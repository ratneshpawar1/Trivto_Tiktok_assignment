import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// A thin, swappable persistence adapter for likes. The rest of the app only
// depends on this interface, so SQLite can be replaced with KV/Postgres/etc.
// on a serverless target without touching the routes (PLAN §1).
//
// There are no user accounts, so likes are GLOBAL / per-deployment. This
// tradeoff is documented in the README.
export interface LikesStore {
  /** All currently-liked ids. */
  getAll(): string[];
  /** Toggle a like. Returns the NEW state: true = now liked, false = now unliked. */
  toggle(id: string): boolean;
  has(id: string): boolean;
  /** Release the underlying handle (mainly for tests). */
  close(): void;
}

/**
 * Create a SQLite-backed likes store at the given path.
 * Pass ":memory:" for an ephemeral store (used in tests).
 */
export function createSqliteLikesStore(dbPath: string): LikesStore {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  // WAL improves concurrent read/write behavior for a long-lived server.
  db.pragma("journal_mode = WAL");
  db.exec("CREATE TABLE IF NOT EXISTS likes (id TEXT PRIMARY KEY)");

  const selectAll = db.prepare("SELECT id FROM likes ORDER BY id");
  const selectOne = db.prepare("SELECT 1 FROM likes WHERE id = ?");
  const insertOne = db.prepare("INSERT OR IGNORE INTO likes (id) VALUES (?)");
  const deleteOne = db.prepare("DELETE FROM likes WHERE id = ?");

  return {
    getAll() {
      return selectAll.all().map((row) => (row as { id: string }).id);
    },
    has(id: string) {
      return selectOne.get(id) !== undefined;
    },
    toggle(id: string) {
      if (selectOne.get(id) !== undefined) {
        deleteOne.run(id);
        return false;
      }
      insertOne.run(id);
      return true;
    },
    close() {
      db.close();
    },
  };
}

/**
 * In-memory fallback store. Used when the filesystem isn't writable (e.g. some
 * serverless platforms). Likes work for the life of the process but don't
 * persist across instances/restarts — surfaced loudly via a warning + README.
 */
export function createMemoryLikesStore(): LikesStore {
  const set = new Set<string>();
  return {
    getAll: () => [...set].sort(),
    has: (id) => set.has(id),
    toggle: (id) => {
      if (set.has(id)) {
        set.delete(id);
        return false;
      }
      set.add(id);
      return true;
    },
    close() {},
  };
}

function resolveDbPath(): string {
  return (
    process.env.LIKES_DB_PATH || path.join(process.cwd(), "data", "likes.db")
  );
}

// Process-wide singleton for the app to use.
let singleton: LikesStore | null = null;

export function likesStore(): LikesStore {
  if (singleton) return singleton;
  try {
    singleton = createSqliteLikesStore(resolveDbPath());
  } catch (err) {
    // Read-only / ephemeral filesystem (common on serverless). Degrade to an
    // in-memory store so the app keeps working instead of 500-ing. For durable
    // global likes on serverless, set LIKES_DB_PATH to a persistent volume or
    // swap this adapter for KV/Postgres (see README).
    console.warn(
      "[likes] SQLite unavailable; using in-memory store (likes won't persist):",
      err instanceof Error ? err.message : err,
    );
    singleton = createMemoryLikesStore();
  }
  return singleton;
}
