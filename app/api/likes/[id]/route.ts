import { NextResponse } from "next/server";
import { likesStore } from "@/lib/likesStore";
import { validateLikeId, validateFeedImage } from "@/lib/validate";
import { errorResponse } from "@/lib/http";
import { AppError, badRequest } from "@/lib/errors";
import type { FeedImage, LikeToggleResponse } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A single FeedImage JSON is ~1KB; cap well above that to bound memory and
// reject anything that isn't a plausible like body.
const MAX_BODY_BYTES = 16 * 1024;

// In Next.js 16 the dynamic-segment `params` is a Promise and MUST be awaited.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const validId = validateLikeId(id);

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY_BYTES) throw badRequest("Body too large");

    // Optional body: the FeedImage to persist so the Liked view can show it.
    // No / invalid JSON body is fine for an un-like — only a present-but-bad
    // image is rejected here.
    let image: FeedImage | undefined;
    try {
      const body = (await request.json()) as { image?: unknown };
      if (body && body.image !== undefined) {
        image = validateFeedImage(validId, body.image);
      }
    } catch (err) {
      if (err instanceof AppError) throw err; // validation failure -> 400
      // otherwise: empty/non-JSON body, treat as no image
    }

    // Every like must carry a (valid) image so it's renderable in the Liked
    // view; otherwise the liked count would diverge from what the view shows.
    // Un-likes (the id is already liked) don't need a body.
    const store = likesStore();
    if (!store.has(validId) && !image) {
      throw badRequest("An image is required to like a photo");
    }

    const liked = store.toggle(validId, image);
    const body: LikeToggleResponse = { id: validId, liked };
    return NextResponse.json(body);
  } catch (err) {
    return errorResponse(err);
  }
}
