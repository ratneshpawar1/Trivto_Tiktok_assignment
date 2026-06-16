# Build Plan — Vertical Image Feed ("TikTok for photos")

> **Audience:** This file is written for Claude Code to execute, phase by phase.
> **Working agreement:** Build in order. Do not start a phase until the previous phase's
> *Acceptance criteria* pass. Stop at every **HUMAN ACTION** marker and wait — do not
> fabricate API keys, do not push to a remote, do not invent credentials.

---

## 0. Read this first (rules for the whole build)

- **Scope is narrow on purpose.** One screen, one flow. Build the core well; do **not**
  add auth, user accounts, a heavy ORM, a design system, or extra screens.
- **Stretch goals are opt-in.** Items marked ➕ are skipped by default. Only attempt one
  *after* the entire core (✅) is solid and verified.
- **Commit discipline.** Small, meaningful commits per sub-phase (e.g.
  `feat(api): add /api/feed proxy with normalization`). Never commit secrets.
- **The key never reaches the client.** All third-party calls go through our own
  Route Handlers. The browser only ever talks to `/api/*`.
- **Code against our own DTO, never the raw Pexels shape** (see §3).
- **When unsure between two reasonable approaches, pick the simpler one and note it in
  the README's "known issues / decisions" section.**

### 🙋 Consolidated HUMAN ACTION checklist (details inline in each phase)
1. **Phase 0.3** — Register a Pexels account, generate an API key, and paste it into
   `.env.local` (Claude Code creates the file with a blank placeholder; the human fills it).
2. **Phase 1.4 / 2.x** — Run the app and judge *feel* on a narrow viewport / real phone.
   "Smooth snapping" is a human call, not an automated check.
3. **Phase 4.2** — Save the Claude Code session / real prompts as you go for `AI_WORKFLOW.md`.
   This document is about *your* judgment and cannot be auto-generated honestly.
4. **Phase 4.3** — Create the Git remote (GitHub/GitLab) and push. Claude Code commits
   locally but does not create remotes or push without explicit instruction.

---

## 1. Locked technical decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Framework | **Next.js (App Router) + TypeScript** | One deployable gives both the React UI and the owned backend (Route Handlers). |
| Backend | **Next.js Route Handlers** under `app/api/` | Satisfies "a backend layer you own"; same-origin by default. |
| Image API | **Pexels** (curated endpoint) | Instant header auth, feed-shaped endpoint, pre-sized portrait images, 200 req/hr · 20k/mo. |
| API fallback | **Lorem Picsum** (`/v2/list`) | Zero-auth path documented in README so reviewers can run without a key. |
| Like persistence | **SQLite via `better-sqlite3`** behind a thin adapter | A real server-side store (strongest "real backend" signal). Adapter is swappable for KV/Postgres on serverless. |
| Styling | Plain CSS Modules or Tailwind (pick one, keep minimal) | Avoid a design-system rabbit hole. |
| Snap mechanism | **CSS `scroll-snap`**, not JS | Smoother, less code, native momentum. |

> **Decision note for the human:** SQLite is the default because it's a genuinely real
> backend store. There are **no user accounts**, so likes are per-deployment/global — this
> tradeoff must be stated plainly in the README. If you'd rather have zero infra, the
> documented alternative is `localStorage` persistence; if you switch, keep the same
> `/api/likes` contract shape so the frontend doesn't change.

---

## 2. Project structure (target)

```
/app
  /api
    /feed/route.ts          # GET proxy → Pexels curated → normalized DTO
    /likes/route.ts         # GET all liked ids
    /likes/[id]/route.ts    # POST toggle like
  layout.tsx
  page.tsx                  # the single feed screen
/components
  Feed.tsx
  FeedSlide.tsx
  LikeButton.tsx
  states/ (Loading, Empty, ErrorState)
/hooks
  useFeed.ts                # pagination + infinite load
  useLikes.ts               # like hydration + optimistic toggle
/lib
  pexels.ts                 # upstream client (server-only)
  normalize.ts              # raw upstream → FeedImage DTO
  likesStore.ts             # SQLite adapter (swappable)
  validate.ts               # param validation helpers
  errors.ts                 # typed error mapping
/test                       # backend-focused tests
.env.example
.env.local                  # created with placeholder; 🙋 human pastes key
README.md
AI_WORKFLOW.md
```

---

## 3. Internal data contract (define before any UI)

```ts
// The ONLY image shape the frontend knows about.
export interface FeedImage {
  id: string;        // stable id from upstream
  width: number;
  height: number;
  srcUrl: string;    // full-viewport image (portrait/large)
  thumbUrl: string;  // tiny blur/placeholder
  author: string;    // for attribution
  alt: string;       // accessibility; fall back to author/"photo"
}

// Feed endpoint response
export interface FeedResponse {
  items: FeedImage[];
  nextPage: number | null;   // null = no more pages
}

// Likes endpoint response
export interface LikesResponse { likedIds: string[]; }
```

`normalize.ts` maps the raw Pexels payload to `FeedImage` and **drops any record missing a
usable image URL** so bad data never reaches the UI.

---

## Phase 0 — Foundation & setup

**Goal:** Runnable Next.js skeleton with env handling and the DTO in place.

- **0.1** ✅ Scaffold Next.js (App Router, TypeScript, src not required). Add the folder
  structure from §2 (empty stubs are fine).
- **0.2** ✅ Mobile-first baseline: `viewport` meta with `viewport-fit=cover`; global CSS
  using `100dvh` (not `100vh`) for slide height; ESLint + Prettier configured.
- **0.3** ✅ Env handling:
  - Create `.env.example` containing **only** placeholder keys, e.g.:
    ```
    PEXELS_API_KEY=your_key_here
    IMAGE_SOURCE=pexels   # or "picsum" for the no-key fallback
    ```
  - Create `.env.local` with the same keys but **blank values**.
  - Ensure `.gitignore` excludes `.env*` (but **not** `.env.example`).
  - 🙋 **HUMAN ACTION:** Register at the Pexels API site, generate a key, and paste it
    into `.env.local` as `PEXELS_API_KEY`. **Stop here and tell the human** — do not
    proceed to call the live API until they confirm the key is in place. (The app should
    still build/run against the `picsum` fallback without a key.)
- **0.4** ✅ Add the `FeedImage` / `FeedResponse` / `LikesResponse` types from §3 in a
  shared `types.ts`.

**Acceptance criteria:** `npm run dev` starts; a blank page renders; `tsc` and lint pass;
no secret is tracked by git (`git status` shows `.env.local` ignored).

---

## Phase 1 — Backend first (proxy + likes + validation) ✅

**Why first:** the UI should be built against a real, stable contract.

- **1.1** ✅ `lib/pexels.ts` (server-only) calls the Pexels **curated** endpoint with the
  `Authorization` header and `per_page` (use a sensible page size, e.g. 10–15).
  `lib/normalize.ts` maps to `FeedImage[]`. `GET /api/feed?page=` returns `FeedResponse`
  with `nextPage` derived from upstream `next_page`.
- **1.2** ✅ **Backend hardening (be careful here):**
  - Validate/coerce `page` (positive integer, capped max); junk → `400`.
  - `fetch` with a timeout + `AbortController`.
  - Map upstream failures via `lib/errors.ts`: upstream **429 → 503** `{ error: "rate_limited", retryAfter }`; upstream 5xx → **502** `{ error: "upstream_error" }`.
  - Read `X-Ratelimit-Remaining` / `X-Ratelimit-Reset` and include a normalized backoff
    hint in the response (these headers are present only on successful responses).
  - Short-TTL in-memory cache of pages (~60s) to reduce upstream calls and stay under the
    rate limit. Pexels image URLs are stable, so caching is safe.
  - If `IMAGE_SOURCE=picsum`, route to the Picsum `/v2/list?page=&limit=` path through the
    same normalizer (no key needed).
- **1.3** ✅ Likes store + endpoints:
  - `lib/likesStore.ts` = thin SQLite adapter (`better-sqlite3`), single `likes(id TEXT PRIMARY KEY)` table. Keep methods tiny: `getAll()`, `toggle(id)`.
  - `GET /api/likes` → `{ likedIds }`. `POST /api/likes/[id]` → toggles, returns new state.
  - Validate `:id` (non-empty, length-capped, expected charset); reject otherwise.
  - 🙋 **HUMAN ACTION (only if SQLite native build fails on this machine):** `better-sqlite3`
    is a native module. If install fails, tell the human; the documented fallback is a
    JSON-file store or `localStorage` — do not silently switch stores without flagging it.
- **1.4** ✅ Backend tests (focused — this is where tests matter most):
  - Unit: `normalize.ts` including missing-field / missing-image records get dropped.
  - Unit: `page` validation + `nextPage` cursor logic.
  - Unit: `likesStore` toggle (add → remove → idempotency).
  - Integration: `/api/feed` against a **mocked upstream** for success, 429, and 500.

**Acceptance criteria:** `curl localhost:3000/api/feed?page=1` returns valid `FeedResponse`;
malformed `page` returns 400; mocked 429 returns 503 with `retryAfter`; like toggle persists
across a server restart; all Phase 1 tests pass.

---

## Phase 2 — Core feed UI ✅

- **2.1** ✅ Full-screen snap container: `scroll-snap-type: y mandatory`; each `FeedSlide`
  is `100dvh` with `scroll-snap-align: start`; image fills viewport with `object-fit: cover`.
- **2.2** ✅ `useFeed` hook: tracks loaded pages + `nextPage`; an `IntersectionObserver`
  sentinel placed a few slides from the end triggers the next fetch **before** the bottom.
  Guard against duplicate in-flight fetches.
- **2.3** ✅ `useLikes` + `LikeButton`: hydrate liked ids from `GET /api/likes` on load;
  tapping toggles **optimistically**, then `POST /api/likes/[id]`; roll back on failure.
  Verify likes survive a hard refresh.
- **2.4** ✅ Graceful states: initial loading, per-image loading, empty result, and a
  visible error state that distinguishes **rate-limited (with a Retry)** from generic failure.

**Acceptance criteria:** scrolling snaps one image per screen; new pages load before the
end with no visible "end of feed" jank; a like persists across refresh; killing the network
shows the error state, not a blank/broken screen.

---

## Phase 3 — Feel & robustness ✅ (kept tight)

- **3.1** ✅ Prevent layout shift: fixed slide box, blur/`thumbUrl` placeholder until the
  full image loads.
- **3.2** ✅ Input parity: native scroll + touch swipe (via snap) + **arrow-key** nav for
  desktop review.
- **3.3** ➕ Preload the next 1–2 images so scrolling never shows a blank frame.
  *(Best single stretch goal — directly serves "feel". Attempt only if core is solid.)*
- **3.4** ✅ Broken/missing image fallback + a retry affordance on a failed image load.

**Acceptance criteria:** no flash of empty frame on normal scroll; arrow keys move the feed;
a deliberately broken image URL shows a fallback, not a layout break.
🙋 **HUMAN ACTION:** Judge "smoothness" on a narrow viewport (device emulation or a real
phone). This is subjective and is the human's call to sign off.

---

## Phase 4 — Docs, AI workflow, delivery

- **4.1** ✅ `README.md`: setup/run steps; which API + how to get a key; the Picsum
  no-key fallback; `.env.example` note; the likes-are-global decision; "what I'd do next";
  known issues.
- **4.2** ✅ `AI_WORKFLOW.md` (1–2 pages): tools used and for what; **3–5 real prompts**
  (including at least one where the AI got it wrong + how it was caught/fixed); where AI was
  *not* used and why; how generated code was verified (reviewed / tested / rewritten).
  🙋 **HUMAN ACTION:** This file must reflect the human's actual process and judgment.
  Save prompts/sessions *as you go*; do not reconstruct or fabricate them at the end.
- **4.3** ✅ Final QA pass in a narrow viewport; tidy commit history.
  🙋 **HUMAN ACTION:** Create the Git remote and push (and/or zip the repo). Claude Code
  commits locally only; it does not create remotes or push without explicit instruction.
- **4.4** ➕ At most **one** further stretch goal *only if everything above is rock-solid*:
  double-tap-to-like animation **or** a "liked" view. Skip by default.

**Acceptance criteria:** a fresh clone runs by following the README alone; `AI_WORKFLOW.md`
is honest and specific; commit history is readable.

---

## 5. Definition of done (core)

- [ ] Snap-scroll feed, one image per viewport, smooth on a phone-sized screen.
- [ ] Real paginated Pexels data via our own proxy; **no key in client or git history**.
- [ ] Infinite load fires before the bottom; no end-of-feed jank.
- [ ] Like is immediate and survives refresh (server-backed).
- [ ] Loading, empty, and error (incl. rate-limited) states all handled visibly.
- [ ] Backend tests pass (normalization, validation, error mapping, like toggle).
- [ ] README + honest AI_WORKFLOW.md present.

## 6. Explicitly OUT of scope (do not build)
Auth / user accounts · multiple feeds or screens · server-side rendering of images ·
virtualization (unless a long session visibly degrades) · a component/design system ·
analytics · more than one stretch goal.
