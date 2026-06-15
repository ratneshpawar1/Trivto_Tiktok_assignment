import { NextResponse } from "next/server";
import { AppError } from "./errors";

/**
 * Map any thrown value to a JSON error response with the right status.
 * Known AppErrors keep their mapped status/body; anything else becomes a
 * generic 500 (and is logged server-side so the real cause isn't lost).
 */
export function errorResponse(err: unknown): NextResponse {
  const appErr =
    err instanceof AppError
      ? err
      : new AppError(500, "internal_error", "Unexpected error");

  if (!(err instanceof AppError)) {
    // Unexpected — surface in server logs, never to the client.
    console.error("[api] unexpected error:", err);
  }

  const headers: Record<string, string> = {};
  if (appErr.code === "rate_limited" && appErr.retryAfter !== undefined) {
    headers["retry-after"] = String(appErr.retryAfter);
  }

  return NextResponse.json(appErr.toBody(), {
    status: appErr.status,
    headers,
  });
}
