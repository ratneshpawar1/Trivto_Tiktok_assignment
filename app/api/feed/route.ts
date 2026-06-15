import { NextResponse, type NextRequest } from "next/server";
import {
  fetchFeedPage,
  imageSource,
  type FeedPageResult,
} from "@/lib/pexels";
import { TTLCache } from "@/lib/cache";
import { parsePage } from "@/lib/validate";
import { errorResponse } from "@/lib/http";
import type { FeedResponse } from "@/types";

// Native module (better-sqlite3 isn't used here, but the upstream fetch and
// request access make this inherently dynamic). Force it so it's never
// statically prerendered at build time with stale data.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FEED_TTL_MS = 60_000;
// Module-scoped so they survive across requests in a long-lived server process.
const feedCache = new TTLCache<FeedResponse>(FEED_TTL_MS);
// Coalesce concurrent cold-cache misses for the same key: a burst of requests
// for one uncached page produces ONE upstream call, not N. This is the main
// way a traffic spike would otherwise trip the Pexels rate limit.
const inFlight = new Map<string, Promise<FeedPageResult>>();

function loadPage(cacheKey: string, page: number): Promise<FeedPageResult> {
  const existing = inFlight.get(cacheKey);
  if (existing) return existing;
  // Deliberately NOT bound to a single request's AbortSignal — the result is
  // shared across coalesced callers, so one client disconnecting must not abort
  // the fetch for the others. The upstream client's own timeout still bounds it.
  const promise = fetchFeedPage(page).finally(() => inFlight.delete(cacheKey));
  inFlight.set(cacheKey, promise);
  return promise;
}

export async function GET(request: NextRequest) {
  try {
    const page = parsePage(request.nextUrl.searchParams.get("page"));
    const cacheKey = `${imageSource()}:${page}`;

    const cached = feedCache.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached, { headers: { "x-feed-cache": "hit" } });
    }

    const { feed, rateLimit } = await loadPage(cacheKey, page);
    feedCache.set(cacheKey, feed);

    // Normalized backoff hint exposed via headers so the typed FeedResponse DTO
    // stays clean (PLAN §1.2).
    const headers: Record<string, string> = { "x-feed-cache": "miss" };
    if (rateLimit.remaining !== null) {
      headers["x-ratelimit-remaining"] = String(rateLimit.remaining);
    }
    if (rateLimit.reset !== null) {
      headers["x-ratelimit-reset"] = String(rateLimit.reset);
    }

    return NextResponse.json(feed, { headers });
  } catch (err) {
    return errorResponse(err);
  }
}
