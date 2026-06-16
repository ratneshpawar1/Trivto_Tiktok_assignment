# Vertical Image Feed — "TikTok for photos"

A full-screen, vertically snap-scrolling photo feed built with Next.js (App
Router) + TypeScript. Real paginated images come from Pexels through a backend
proxy we own — **the API key never reaches the browser**. Likes are persisted
server-side.

## Features

- **Snap-scroll feed** — one photo per screen, native CSS scroll-snap, `100dvh`
  slides sized for mobile browser chrome.
- **Infinite load** — an `IntersectionObserver` sentinel fetches the next page a
  couple of viewports before the bottom (no end-of-feed jank), with in-flight
  de-dup on both client and server.
- **Likes** — tap the heart or **double-tap the photo** to like/unlike.
  Optimistic UI with rollback; persisted in a real server-side store and survives
  a refresh.
- **Liked view** — a tab to see everything you've liked (image data is stored on
  like, so the view is complete even after a refresh).
- **Resilient states** — initial loading, per-image loading (blur placeholder),
  empty, broken-image fallback + retry, and an error state that distinguishes a
  **rate-limited** failure (with a Retry) from a generic one.
- **Capped image column** — on wide desktop screens the photo is centered in a
  phone-width column with a blurred backdrop instead of stretching edge-to-edge.
- **Input parity** — touch swipe / mouse scroll (snap) + **arrow-key** navigation
  for desktop; honors `prefers-reduced-motion`.
- **Scroll restore** — refreshing returns you to the image you were on, not the
  top.

## Getting started

### Prerequisites

- Node.js **20.9+** (Next.js 16 requirement)

### Install

```bash
npm install
```

> `better-sqlite3` is a native module and builds on install. If that fails on
> your machine, see [Likes storage](#likes-storage) for the no-native fallback.

### Configure environment

```bash
cp .env.example .env.local
```

`.env.local` keys:

```
PEXELS_API_KEY=your_key_here   # required only when IMAGE_SOURCE=pexels
IMAGE_SOURCE=pexels            # or "picsum" for the no-key fallback
```

- **With a Pexels key (recommended):** create a free key at
  <https://www.pexels.com/api/>, paste it into `PEXELS_API_KEY`, and set
  `IMAGE_SOURCE=pexels`.
- **No key:** set `IMAGE_SOURCE=picsum` to run against
  [Lorem Picsum](https://picsum.photos) — zero auth, so a reviewer can run the
  app without signing up for anything.

`.env*` is git-ignored (except `.env.example`); the key is never committed.

### Run

```bash
npm run dev        # http://localhost:3000
npm run build && npm run start   # production
npm test           # backend + UI tests (Vitest)
npm run typecheck  # tsc --noEmit
npm run lint
```

## How it works

```
Browser ──▶ /api/feed       (Route Handler) ──▶ Pexels/Picsum   ← key lives here
        ──▶ /api/likes       GET liked ids (+ ?full=1 = liked images)
        ──▶ /api/likes/[id]  POST toggle like
```

- The browser only ever talks to our own `/api/*` routes (same-origin). All
  third-party calls and the API key stay server-side.
- The frontend codes against an internal **DTO** (`FeedImage` in `types.ts`),
  never the raw Pexels/Picsum payload. `lib/normalize.ts` maps upstream → DTO and
  drops any record missing a usable image URL.
- The feed proxy validates `page`, times out via `AbortController`, maps upstream
  failures to stable codes (429→503 `rate_limited`+`retryAfter`, 5xx→502), and
  keeps a 60s in-memory page cache plus in-flight request coalescing to stay
  under the rate limit.

### Likes storage

Likes are stored in **SQLite** via `better-sqlite3` behind a thin, swappable
adapter (`lib/likesStore.ts`). The stored row keeps the liked image's data so
the Liked view can render photos the current feed pages haven't loaded.

There are **no user accounts**, so **likes are global / per-deployment** — every
visitor shares one set of likes. This is a deliberate scope decision (auth is out
of scope); for a real product you'd key likes by user.

If SQLite can't open (e.g. a read-only serverless filesystem), the store
**falls back to in-memory** so the app keeps working — likes just won't persist
across instances/restarts (a warning is logged).

## Deployment

1. Set environment variables on the host: `PEXELS_API_KEY` and `IMAGE_SOURCE`
   (or `IMAGE_SOURCE=picsum` for a keyless demo).
2. Likes persistence depends on the target:
   - **Server / container / VM with a writable disk** (Render, Railway, Fly,
     Docker, a VPS): works out of the box. Point `LIKES_DB_PATH` at a persistent
     volume to keep likes across deploys.
   - **Serverless (e.g. Vercel):** the filesystem is read-only/ephemeral, so the
     store degrades to in-memory (likes won't persist). For durable global likes
     there, set `LIKES_DB_PATH` to a mounted volume **or** swap `likesStore.ts`
     for a KV/Postgres adapter — the rest of the app is unchanged because it only
     depends on the `LikesStore` interface.

The routes run on the Node.js runtime (`export const runtime = "nodejs"`) because
`better-sqlite3` is a native addon, and `better-sqlite3` is in
`serverExternalPackages` so it isn't bundled.

## Known issues / decisions

- **Likes are global** (no accounts) — see above.
- **Liked view shows only photos liked *with* this version.** Likes created
  before image data was stored (an older build) keep working as membership but
  don't appear in the Liked view (they have no stored image).
- **Plain `<img>`, not `next/image`.** We serve external URLs directly and manage
  load/error/blur state ourselves, avoiding the optimizer proxying (and being
  billed for) every external image. Trade-off: no automatic responsive
  optimization.
- **A bare `%` in a like-id URL returns 500**, because Next's router rejects the
  malformed path before our handler runs. The realistic singly-encoded case
  (`%25` → literal `%`) is correctly handled as a `400`.
- **Smooth arrow-key scroll** doesn't animate in a backgrounded/automation tab
  (requestAnimationFrame is paused there); it works normally in a focused tab.

## What I'd do next

- Per-user likes (the only thing standing between this and a real product) once
  auth exists.
- The `➕` opt-in: preload the next 1–2 images so a fast scroll never shows a
  blank frame.
- Virtualize the feed if a very long session degrades (currently all loaded
  slides stay mounted).
- A KV/Postgres `LikesStore` implementation for first-class serverless durability.
