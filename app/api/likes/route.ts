import { NextResponse } from "next/server";
import { likesStore } from "@/lib/likesStore";
import { errorResponse } from "@/lib/http";
import type { LikesResponse } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const body: LikesResponse = { likedIds: likesStore().getAll() };
    return NextResponse.json(body);
  } catch (err) {
    return errorResponse(err);
  }
}
