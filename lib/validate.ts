import { badRequest } from "./errors";
import type { FeedImage } from "../types";

/** Pages above this are rejected — upstream APIs don't go this deep and it
 * caps abuse / accidental huge cursors. */
export const MAX_PAGE = 1000;

/** Like ids come from upstream image providers (Pexels numeric ids, Picsum
 * string ids). Keep the accepted charset tight to avoid junk in the store
 * and any chance of weird values reaching SQL (which is parameterized anyway). */
const LIKE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Parse and validate the `page` query param.
 * - missing  -> defaults to 1
 * - valid    -> the positive integer
 * - junk / out of range -> throws AppError(400)
 */
export function parsePage(raw: string | null | undefined): number {
  if (raw === null || raw === undefined || raw === "") return 1;

  // Reject anything that isn't a plain run of digits (no signs, decimals,
  // whitespace, hex, "1e3", etc.).
  if (!/^\d+$/.test(raw)) {
    throw badRequest(`Invalid page: ${raw}`);
  }

  const page = Number(raw);
  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) {
    throw badRequest(`Page out of range (1-${MAX_PAGE}): ${raw}`);
  }
  return page;
}

/**
 * Validate a like id. Returns the id if acceptable, otherwise throws
 * AppError(400). Never trust the URL segment — it can be anything.
 */
export function validateLikeId(raw: string | null | undefined): string {
  if (typeof raw !== "string") throw badRequest("Missing id");
  let id: string;
  try {
    id = decodeURIComponent(raw);
  } catch {
    // Malformed percent-encoding (e.g. "%", "%zz") — decodeURIComponent throws
    // a raw URIError. Convert to a 400 so it doesn't escape as a 500 and so we
    // don't log attacker-controlled input as an "unexpected" error.
    throw badRequest("Invalid id");
  }
  if (!LIKE_ID_RE.test(id)) {
    throw badRequest(`Invalid id: ${raw}`);
  }
  return id;
}

// Image URLs we're willing to persist and later render via <img src>. Locking
// this down stops arbitrary/attacker URLs being stored through the like body.
const ALLOWED_IMAGE_HOSTS = new Set([
  "images.pexels.com",
  "picsum.photos",
  "fastly.picsum.photos",
]);
const MAX_URL_LEN = 2048;
const MAX_TEXT_LEN = 512;

function isAllowedImageUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_URL_LEN) {
    return false;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "https:" && ALLOWED_IMAGE_HOSTS.has(url.hostname);
}

/**
 * Validate a client-supplied FeedImage before persisting it with a like.
 * The id must match the route param; URLs must be https on an allowed host.
 * Author/alt are free text (rendered escaped by React) but length-capped.
 */
export function validateFeedImage(id: string, raw: unknown): FeedImage {
  if (!raw || typeof raw !== "object") throw badRequest("Missing image");
  const o = raw as Record<string, unknown>;

  if (o.id !== id) throw badRequest("Image id does not match");
  if (!isAllowedImageUrl(o.srcUrl)) throw badRequest("Invalid srcUrl");
  if (!isAllowedImageUrl(o.thumbUrl)) throw badRequest("Invalid thumbUrl");

  const width = Number(o.width);
  const height = Number(o.height);
  if (!Number.isFinite(width) || width < 0 || width > 100000) {
    throw badRequest("Invalid width");
  }
  if (!Number.isFinite(height) || height < 0 || height > 100000) {
    throw badRequest("Invalid height");
  }

  const author =
    typeof o.author === "string" && o.author.trim()
      ? o.author.slice(0, MAX_TEXT_LEN)
      : "Unknown";
  const alt =
    typeof o.alt === "string" && o.alt.trim() ? o.alt.slice(0, MAX_TEXT_LEN) : "photo";

  return {
    id,
    width,
    height,
    srcUrl: o.srcUrl as string,
    thumbUrl: o.thumbUrl as string,
    author,
    alt,
  };
}
