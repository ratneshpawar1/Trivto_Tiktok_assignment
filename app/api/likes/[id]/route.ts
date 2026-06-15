import { NextResponse } from "next/server";
import { likesStore } from "@/lib/likesStore";
import { validateLikeId } from "@/lib/validate";
import { errorResponse } from "@/lib/http";
import type { LikeToggleResponse } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// In Next.js 16 the dynamic-segment `params` is a Promise and MUST be awaited.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const validId = validateLikeId(id);
    const liked = likesStore().toggle(validId);
    const body: LikeToggleResponse = { id: validId, liked };
    return NextResponse.json(body);
  } catch (err) {
    return errorResponse(err);
  }
}
