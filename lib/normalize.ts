import type { FeedImage, FeedResponse } from "../types";
import { MAX_PAGE } from "./validate";

// ---- Raw upstream shapes (only the fields we read) ---------------------------

export interface PexelsPhotoSrc {
  original?: string;
  large2x?: string;
  large?: string;
  medium?: string;
  portrait?: string;
  tiny?: string;
}

export interface PexelsPhoto {
  id?: number;
  width?: number;
  height?: number;
  photographer?: string;
  alt?: string;
  src?: PexelsPhotoSrc;
}

export interface PexelsCuratedResponse {
  page?: number;
  per_page?: number;
  photos?: PexelsPhoto[];
  next_page?: string; // a full URL string; absent on the last page
}

export interface PicsumPhoto {
  id?: string;
  author?: string;
  width?: number;
  height?: number;
}

// ---- Normalizers -------------------------------------------------------------

/**
 * Map a Pexels curated payload to our DTO.
 * Records missing a usable full image URL are DROPPED so bad data never
 * reaches the UI (PLAN §3).
 */
export function normalizePexels(
  raw: PexelsCuratedResponse,
  page: number,
): FeedResponse {
  const photos = Array.isArray(raw?.photos) ? raw.photos : [];

  const items: FeedImage[] = [];
  for (const p of photos) {
    const src = p?.src ?? {};
    // Prefer the portrait crop (best for a full-height vertical feed),
    // then fall back through progressively larger generic sizes.
    const srcUrl =
      src.portrait || src.large2x || src.large || src.medium || src.original;
    if (!srcUrl || p?.id === undefined || p?.id === null) continue; // drop unusable record

    const author = (p.photographer || "").trim() || "Unknown";
    items.push({
      id: String(p.id),
      width: typeof p.width === "number" ? p.width : 0,
      height: typeof p.height === "number" ? p.height : 0,
      srcUrl,
      thumbUrl: src.tiny || srcUrl,
      author,
      alt: (p.alt || "").trim() || author || "photo",
    });
  }

  // Pexels gives a `next_page` URL string only when more pages exist.
  // Clamp at MAX_PAGE so we never advertise a cursor that parsePage would 400.
  const nextPage = raw?.next_page && page < MAX_PAGE ? page + 1 : null;
  return { items, nextPage };
}

/** Build a portrait-cropped Picsum URL for a given id at a target size. */
function picsumUrl(id: string, w: number, h: number): string {
  return `https://picsum.photos/id/${encodeURIComponent(id)}/${w}/${h}`;
}

/**
 * Map a Lorem Picsum `/v2/list` payload (array) to our DTO.
 * Picsum doesn't report a total, so the cursor advances while a full page
 * was returned and stops when a short/empty page comes back.
 */
export function normalizePicsum(
  raw: PicsumPhoto[],
  page: number,
  limit: number,
): FeedResponse {
  const list = Array.isArray(raw) ? raw : [];

  const items: FeedImage[] = [];
  for (const p of list) {
    if (!p || p.id === undefined || p.id === null || `${p.id}` === "") continue;
    const id = String(p.id);
    const author = (p.author || "").trim() || "Unknown";
    items.push({
      id,
      width: 1080,
      height: 1920,
      srcUrl: picsumUrl(id, 1080, 1920),
      thumbUrl: picsumUrl(id, 27, 48), // tiny, used as a blur placeholder
      author,
      alt: `Photo by ${author}`,
    });
  }

  const nextPage =
    list.length >= limit && list.length > 0 && page < MAX_PAGE
      ? page + 1
      : null;
  return { items, nextPage };
}
