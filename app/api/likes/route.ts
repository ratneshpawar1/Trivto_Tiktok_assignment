import { NextResponse, type NextRequest } from "next/server";
import { likesStore } from "@/lib/likesStore";
import { errorResponse } from "@/lib/http";
import type { LikesResponse, LikesFullResponse } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const store = likesStore();
    const likedIds = store.getAll();

    // ?full=1 also returns the stored image data for the Liked view.
    if (request.nextUrl.searchParams.get("full")) {
      const body: LikesFullResponse = { likedIds, items: store.getImages() };
      return NextResponse.json(body);
    }

    const body: LikesResponse = { likedIds };
    return NextResponse.json(body);
  } catch (err) {
    return errorResponse(err);
  }
}
