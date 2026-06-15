import { badRequest } from "./errors";

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
