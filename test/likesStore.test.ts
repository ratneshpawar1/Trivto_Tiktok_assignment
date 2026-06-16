import { describe, it, expect, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import {
  createSqliteLikesStore,
  createMemoryLikesStore,
} from "../lib/likesStore";

describe("likesStore (in-memory)", () => {
  it("toggles add -> remove and is idempotent in pairs", () => {
    const store = createSqliteLikesStore(":memory:");
    try {
      expect(store.getAll()).toEqual([]);
      expect(store.has("a")).toBe(false);

      // add
      expect(store.toggle("a")).toBe(true);
      expect(store.has("a")).toBe(true);
      expect(store.getAll()).toEqual(["a"]);

      // remove
      expect(store.toggle("a")).toBe(false);
      expect(store.has("a")).toBe(false);
      expect(store.getAll()).toEqual([]);

      // toggling twice returns to the original state
      store.toggle("b");
      store.toggle("b");
      expect(store.getAll()).toEqual([]);
    } finally {
      store.close();
    }
  });

  it("keeps multiple likes and returns them sorted", () => {
    const store = createSqliteLikesStore(":memory:");
    try {
      store.toggle("10");
      store.toggle("2");
      store.toggle("30");
      expect(store.getAll()).toEqual(["10", "2", "30"].sort());
    } finally {
      store.close();
    }
  });
});

const sampleImage = {
  id: "a",
  width: 1080,
  height: 1920,
  srcUrl: "https://images.pexels.com/a.jpg",
  thumbUrl: "https://images.pexels.com/a-t.jpg",
  author: "Ada",
  alt: "a",
};

describe("likesStore image persistence", () => {
  it("stores the image on like and returns it from getImages", () => {
    const store = createSqliteLikesStore(":memory:");
    try {
      store.toggle("a", sampleImage);
      expect(store.getImages()).toEqual([sampleImage]);
      // unlike removes it from both ids and images
      store.toggle("a");
      expect(store.getImages()).toEqual([]);
      expect(store.getAll()).toEqual([]);
    } finally {
      store.close();
    }
  });

  it("drops legacy image-less rows on migration so the count can't lie", async () => {
    const dbPath = path.join(
      os.tmpdir(),
      `likes-migrate-${process.pid}-${Date.now()}.db`,
    );
    // Simulate the pre-feature schema with one image-less row.
    const Database = (await import("better-sqlite3")).default;
    const old = new Database(dbPath);
    old.exec("CREATE TABLE likes (id TEXT PRIMARY KEY)");
    old.prepare("INSERT INTO likes (id) VALUES (?)").run("legacy");
    old.close();

    const store = createSqliteLikesStore(dbPath);
    try {
      // The un-renderable legacy like is gone — membership matches the view.
      expect(store.getAll()).toEqual([]);
      expect(store.getImages()).toEqual([]);
      store.toggle("a", sampleImage);
      expect(store.getAll()).toEqual(["a"]);
      expect(store.getImages()).toEqual([sampleImage]);
    } finally {
      store.close();
      for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
        if (fs.existsSync(f)) fs.rmSync(f);
      }
    }
  });
});

describe("createMemoryLikesStore (serverless fallback)", () => {
  it("toggles add -> remove like the SQLite store", () => {
    const store = createMemoryLikesStore();
    expect(store.toggle("a")).toBe(true);
    expect(store.has("a")).toBe(true);
    expect(store.getAll()).toEqual(["a"]);
    expect(store.toggle("a")).toBe(false);
    expect(store.getAll()).toEqual([]);
  });

  it("keeps image data for the Liked view", () => {
    const store = createMemoryLikesStore();
    store.toggle("a", sampleImage);
    expect(store.getImages()).toEqual([sampleImage]);
  });
});

describe("likesStore (file persistence)", () => {
  const dbPath = path.join(
    os.tmpdir(),
    `likes-test-${process.pid}-${Date.now()}.db`,
  );

  afterEach(() => {
    for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      if (fs.existsSync(f)) fs.rmSync(f);
    }
  });

  it("persists likes across a store restart (reopen)", () => {
    const first = createSqliteLikesStore(dbPath);
    first.toggle("persist-me", { ...sampleImage, id: "persist-me" });
    expect(first.has("persist-me")).toBe(true);
    first.close();

    // Simulate a server restart: brand-new store at the same path.
    const second = createSqliteLikesStore(dbPath);
    try {
      expect(second.has("persist-me")).toBe(true);
      expect(second.getAll()).toEqual(["persist-me"]);
      expect(second.getImages()).toHaveLength(1); // image survived too
    } finally {
      second.close();
    }
  });
});
