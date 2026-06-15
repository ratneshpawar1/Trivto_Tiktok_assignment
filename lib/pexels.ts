// Upstream image client — SERVER ONLY. The Pexels API key is read here from
// process.env and never crosses to the client; the browser only ever talks to
// our own /api routes.

import {
  AppError,
  fromUpstreamException,
  fromUpstreamStatus,
} from "./errors";
import {
  normalizePexels,
  normalizePicsum,
  type PexelsCuratedResponse,
  type PicsumPhoto,
} from "./normalize";
import type { FeedResponse } from "../types";

const PEXELS_ENDPOINT = "https://api.pexels.com/v1/curated";
const PICSUM_ENDPOINT = "https://picsum.photos/v2/list";
const PER_PAGE = 15;
const TIMEOUT_MS = 8000;
const DEFAULT_RETRY_AFTER = 60; // seconds, when upstream gives no hint

export interface RateLimit {
  remaining: number | null;
  reset: number | null; // epoch seconds (Pexels semantics)
}

export interface FeedPageResult {
  feed: FeedResponse;
  rateLimit: RateLimit;
}

export type ImageSource = "pexels" | "picsum";

export function imageSource(): ImageSource {
  return process.env.IMAGE_SOURCE === "picsum" ? "picsum" : "pexels";
}

/** A timeout signal combined with the caller's signal (client disconnect). */
function withTimeout(external?: AbortSignal): AbortSignal {
  const signals: AbortSignal[] = [AbortSignal.timeout(TIMEOUT_MS)];
  if (external) signals.push(external);
  return AbortSignal.any(signals);
}

function parseRateLimit(headers: Headers): RateLimit {
  const num = (v: string | null) => {
    if (v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    remaining: num(headers.get("x-ratelimit-remaining")),
    reset: num(headers.get("x-ratelimit-reset")),
  };
}

function retryAfterFromResponse(res: Response): number {
  // RFC 9110 delta-seconds is a non-negative integer; round so we never emit
  // a fractional Retry-After (matches the x-ratelimit-reset handling below).
  const ra = Math.round(Number(res.headers.get("retry-after")));
  if (Number.isFinite(ra) && ra > 0) return ra;
  const reset = Number(res.headers.get("x-ratelimit-reset"));
  if (Number.isFinite(reset) && reset > 0) {
    const delta = Math.round(reset - Date.now() / 1000);
    if (delta > 0) return delta;
  }
  return DEFAULT_RETRY_AFTER;
}

async function fetchPexels(
  page: number,
  signal?: AbortSignal,
): Promise<FeedPageResult> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) {
    // Config problem, not the client's fault — and we don't silently switch
    // sources (PLAN §1.3). Run with IMAGE_SOURCE=picsum to go key-free.
    throw new AppError(
      500,
      "internal_error",
      "PEXELS_API_KEY is not set (use IMAGE_SOURCE=picsum to run without a key)",
    );
  }

  const url = `${PEXELS_ENDPOINT}?per_page=${PER_PAGE}&page=${page}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: key },
      cache: "no-store", // we manage our own short TTL cache instead
      signal: withTimeout(signal),
    });
  } catch (err) {
    throw fromUpstreamException(err);
  }

  if (!res.ok) {
    throw fromUpstreamStatus(res.status, retryAfterFromResponse(res));
  }

  let raw: PexelsCuratedResponse;
  try {
    raw = (await res.json()) as PexelsCuratedResponse;
  } catch {
    throw new AppError(502, "upstream_error", "Malformed upstream response");
  }

  return { feed: normalizePexels(raw, page), rateLimit: parseRateLimit(res.headers) };
}

async function fetchPicsum(
  page: number,
  signal?: AbortSignal,
): Promise<FeedPageResult> {
  const url = `${PICSUM_ENDPOINT}?page=${page}&limit=${PER_PAGE}`;
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", signal: withTimeout(signal) });
  } catch (err) {
    throw fromUpstreamException(err);
  }

  if (!res.ok) {
    throw fromUpstreamStatus(res.status, retryAfterFromResponse(res));
  }

  let raw: PicsumPhoto[];
  try {
    raw = (await res.json()) as PicsumPhoto[];
  } catch {
    throw new AppError(502, "upstream_error", "Malformed upstream response");
  }

  // Picsum has no rate-limit headers; report nulls.
  return {
    feed: normalizePicsum(raw, page, PER_PAGE),
    rateLimit: { remaining: null, reset: null },
  };
}

/** Fetch one normalized feed page from the configured upstream source. */
export function fetchFeedPage(
  page: number,
  signal?: AbortSignal,
): Promise<FeedPageResult> {
  return imageSource() === "picsum"
    ? fetchPicsum(page, signal)
    : fetchPexels(page, signal);
}
