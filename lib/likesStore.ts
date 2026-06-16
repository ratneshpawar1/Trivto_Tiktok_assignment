import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { FeedImage } from "../types";

// A thin, swappable persistence adapter for likes. The rest of the app only
// depends on this interface, so SQLite can be replaced with KV/Postgres/etc.
// on a serverless target without touching the routes (PLAN §1).
//
// Each like stores the FeedImage payload so the "Liked" view can render photos
// the current feed pages haven't loaded (and survive a refresh).
//
// There are no user accounts, so likes are GLOBAL / per-deployment. This
// tradeoff is documented in the README.
export interface LikesStore {
  /** All currently-liked ids. */
  getAll(): string[];
  /** Stored images for liked photos, newest first. */
  getImages(): FeedImage[];
  /**
   * Toggle a like. Returns the NEW state: true = now liked, false = now unliked.
   * Pass the image when liking so it can be shown in the Liked view later.
   */
  toggle(id: string, image?: FeedImage): boolean;
  has(id: string): boolean;
  /** Release the underlying handle (mainly for tests). */
  close(): void;
}

function safeParseImage(json: string | null): FeedImage | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as FeedImage;
  } catch {
    return null;
  }
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
  db.pragma("journal_mode = WAL");
  db.exec(
    "CREATE TABLE IF NOT EXISTS likes (id TEXT PRIMARY KEY, image TEXT, created_at INTEGER)",
  );

  // Migrate an older id-only table by adding the new columns. Pre-existing
  // rows keep a null image (they just won't appear in the Liked view).
  const cols = new Set(
    (db.prepare("PRAGMA table_info(likes)").all() as { name: string }[]).map(
      (c) => c.name,
    ),
  );
  if (!cols.has("image")) db.exec("ALTER TABLE likes ADD COLUMN image TEXT");
  if (!cols.has("created_at")) {
    db.exec("ALTER TABLE likes ADD COLUMN created_at INTEGER");
  }
  // Drop rows that predate image storage (legacy likes, or likes created via raw
  // API without a body). They can't be rendered in the Liked view, and keeping
  // them would make the liked count exceed what the view actually shows.
  db.exec("DELETE FROM likes WHERE image IS NULL");

  const selectAll = db.prepare("SELECT id FROM likes ORDER BY id");
  const selectImages = db.prepare(
    "SELECT image FROM likes WHERE image IS NOT NULL ORDER BY COALESCE(created_at, 0) DESC, id",
  );
  const selectOne = db.prepare("SELECT 1 FROM likes WHERE id = ?");
  const insertOne = db.prepare(
    "INSERT OR REPLACE INTO likes (id, image, created_at) VALUES (?, ?, ?)",
  );
  const deleteOne = db.prepare("DELETE FROM likes WHERE id = ?");

  return {
    getAll() {
      return selectAll.all().map((row) => (row as { id: string }).id);
    },
    getImages() {
      return selectImages
        .all()
        .map((row) => safeParseImage((row as { image: string | null }).image))
        .filter((img): img is FeedImage => img !== null);
    },
    has(id: string) {
      return selectOne.get(id) !== undefined;
    },
    toggle(id: string, image?: FeedImage) {
      if (selectOne.get(id) !== undefined) {
        deleteOne.run(id);
        return false;
      }
      insertOne.run(id, image ? JSON.stringify(image) : null, Date.now());
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
  const map = new Map<string, { image: FeedImage | null; ts: number }>();
  return {
    getAll: () => [...map.keys()].sort(),
    getImages: () =>
      [...map.values()]
        .filter((v) => v.image !== null)
        .sort((a, b) => b.ts - a.ts)
        .map((v) => v.image as FeedImage),
    has: (id) => map.has(id),
    toggle: (id, image) => {
      if (map.has(id)) {
        map.delete(id);
        return false;
      }
      map.set(id, { image: image ?? null, ts: Date.now() });
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
