# AI Workflow

> **Note to reviewer:** I wrote this myself and then improved it with claude to make it prettier and concised.
> You can Find actual PLAN.md (I wrote it based on Assignment.md and then refined it using claude) 
> My approach is always to spend more time on planning and narrow the score for backend where API interacts
> This gives me more freedom while executing to test and focus on end product goal while code 
> quality instead of giving ideas to AI while its building. 

## Tools I used, and for what

- **Claude Code (Opus 4.8)** as the primary pair — scaffolding, the backend
proxy + likes store, the React feed, and the tests. I drove it **one phase at a
time** against a `PLAN.md` I wrote up front, reviewing each phase before moving
on.
- Inside that, the assistant used a couple of things worth calling out:
  - It read the **bundled Next.js 16 docs** before writing route handlers (my
  `AGENTS.md` told it to, because Next 16 has breaking changes like async
  `params`). This caught real version-specific gotchas instead of guessing from
  older Next knowledge.
  - It ran an **adversarial self-review** over the backend and a **live browser
  check** (driving the running dev server) to verify behavior, not just tests.
- **Vitest** for the test suite (91 tests: backend units + integration, and
React Testing Library for the UI). `tsc`, ESLint, and `next build` as gates.

## Representative prompts (the real ones)

1. **Kickoff / cadence**
  > "Let's Start Implementing PLAN.md, 1 phase at a time (ask me to add anything
  > that needs my intervention)."
   I deliberately kept it phase-by-phase so I could review the backend contract
   before any UI was built, and so I controlled the API-key/secret steps myself.
2. **Phase 1, with the key in place**
  > "I have already added the api key so you can test both. lets start with
  > Phase 1."
   My intent: I'd pasted my Pexels key into `.env.local`, so I wanted it to
   exercise *both* the live Pexels path and the keyless Picsum fallback.
3. **The batch of fixes before docs** (this is where my own judgment mattered most)
  > "Cap the photos to a centered portrait column (roughly phone-width, ~480px)
  > with a blurred backdrop filling the rest — full-bleed stretches badly on a
  > wide desktop screen. Make a double-tap / double-click on the photo toggle the
  > like: like it if it isn't liked, un-like it if it already is. Fix the refresh
  > behaviour — right now it jumps back to the first image; it should stay on the
  > image I was viewing. Make sure likes still persist when this is actually
  > deployed, not just on my local filesystem. And check for other edge cases and
  > security/API issues — leaked keys, injection, bad input."
   
   (These came from me actually using the app, not the plan — so I spelled out
   exactly what "looks bad" and "goes back to top" meant instead of leaving it
   vague.)
4. **Phase 4 docs + feature**
## Where the AI got it wrong (and how I caught it)

### 1. The feed jumped back to the top on refresh — I caught this by *using* it

After the core feed was "done" and all tests were green, I refreshed the page on
my phone and landed back on the **first** image instead of where I'd scrolled to.
The assistant's implementation had no scroll restoration — and no test covered it,
because "tests pass" said nothing about this real-world behavior. I flagged it
explicitly ("after refresh it goes back to top, which shouldn't happen"). The fix
we landed on: persist the current image **index** in `sessionStorage` and restore
it on load, loading deeper pages if needed, behind a brief overlay so there's no
visible jump. **Lesson:** green tests are necessary, not sufficient — I had to
manually exercise the thing to find the gap.

### 2. A lint "fix" introduced a one-frame flash — caught by a test

While clearing a React lint error, the assistant moved the initial data fetch into
a microtask. That subtly regressed the UI: for one frame the feed showed the
**empty** state ("No photos yet") before loading kicked in. A UI test I'd asked
for — asserting the initial loading state — failed and surfaced it immediately.
Fix: initialize the loading flag to `true` since page one always loads on mount.
**Lesson:** asking for behavioral UI tests up front paid for itself; the AI's
"safe" refactor wasn't safe.

### 3. The AI's own backend review found 6 real bugs in its first cut

Before I trusted the Phase 1 backend, I had it run a review. It found
genuine defects in its *own* code — the most important being a "thundering herd"
(concurrent cold-cache requests each hit the upstream API, defeating the rate-limit
cache) and a malformed-URL like id throwing a 500 instead of a 400. Those were
fixed and given regression tests. **Lesson:** a second adversarial pass over
AI-generated code is worth it; the first draft looked fine but wasn't.

### 4. Arrow keys worked in the Feed but not the Liked view — I caught this by trying it

Once the Liked view existed, I tabbed over to it and pressed the arrow keys —
nothing happened. The keyboard navigation had been written inline inside the
Feed component, so the Liked view never got it. The fix was to pull the nav out
into a shared `useArrowKeyNav` hook and use it in both views (with a guard so the
hidden view behind the active one doesn't also grab the keys). I fixed it myself seemed
like a quick small fix.

### 5. The "Liked" count said 8 but only a few photos showed — I spotted the mismatch

The Liked tab badge showed 8, but the Liked view only rendered a handful of
photos. The cause: earlier likes (created via the API during testing, and through
the UI before the Liked view stored image data) had no image saved, so they
counted as "liked" but couldn't be displayed. The badge counted *membership* while
the view counted *renderable* likes. Fix: require an image to create a like
(so every like is renderable), drop the old image-less rows on startup, and clear
the polluted local database.

## Where I did *not* lean on the AI

- **Subjective design calls.** The image-cap width (a phone-width column on
desktop) and signing off on scroll "smoothness" on a real device were my
judgment — I told it the full-screen image looked bad; the specific look was my
call.
- **The scope/tradeoff decisions.** Accepting that likes are global (no accounts),
and choosing to add the Liked view as a *second* stretch goal beyond what the
plan allowed, were mine to make.
- **Secrets and git.** I added the API key myself, and I explicitly told it **not
to commit** certain work so I could review first.

## How I verified the generated code

- **Tests (91):** backend units (normalize/validate/error-mapping/likes store),
backend integration against a mocked upstream (success/429/500/400/cache/
coalescing), and UI tests (hooks + components, incl. optimistic like + rollback,
double-tap, error states, scroll restore, the Liked-view flow). I had it run the
suite repeatedly to shake out a flaky test (a cross-file global leak in the test
harness, not the app) and fix it.
- **Gates:** `tsc --noEmit`, ESLint, and `next build` all clean.
- **Live behavior:** I had it drive the actual running app in a browser to confirm
the things tests can't fully prove — the image cap on a wide screen, double-tap
liking, the Liked view populating, and likes persisting across a server restart.
- **Reading the diffs.** I reviewed each phase before continuing and held commits
until I was satisfied.

