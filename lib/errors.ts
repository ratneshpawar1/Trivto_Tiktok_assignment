// Typed error mapping for the API layer.
//
// We never leak upstream status codes or messages to the client verbatim.
// Instead, upstream failures are mapped to a small, stable set of our own
// codes (see PLAN §1.2):
//   upstream 429  -> 503 rate_limited   { error, retryAfter }
//   upstream 5xx  -> 502 upstream_error { error }
//   timeout/abort -> 504 upstream_timeout
//   bad input     -> 400 bad_request

export type ErrorCode =
  | "bad_request"
  | "rate_limited"
  | "upstream_error"
  | "upstream_timeout"
  | "internal_error";

export interface ErrorBody {
  error: ErrorCode;
  /** Seconds the client should wait before retrying (rate_limited only). */
  retryAfter?: number;
}

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly retryAfter?: number;

  constructor(
    status: number,
    code: ErrorCode,
    message?: string,
    retryAfter?: number,
  ) {
    super(message ?? code);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }

  /** The JSON body we send to the client for this error. */
  toBody(): ErrorBody {
    const body: ErrorBody = { error: this.code };
    if (this.retryAfter !== undefined) body.retryAfter = this.retryAfter;
    return body;
  }
}

export function badRequest(message: string): AppError {
  return new AppError(400, "bad_request", message);
}

/**
 * Map a failed upstream HTTP response to an AppError.
 * @param status   the upstream status code
 * @param retryAfter normalized seconds to wait (parsed from headers), if any
 */
export function fromUpstreamStatus(
  status: number,
  retryAfter?: number,
): AppError {
  if (status === 429) {
    return new AppError(503, "rate_limited", "Upstream rate limited", retryAfter);
  }
  if (status >= 500) {
    return new AppError(502, "upstream_error", `Upstream returned ${status}`);
  }
  // Any other non-OK upstream status (e.g. 401 bad key, 404) is, from the
  // client's perspective, an upstream problem it cannot fix.
  return new AppError(502, "upstream_error", `Upstream returned ${status}`);
}

/** Map a network-level failure (abort/timeout/DNS) to an AppError. */
export function fromUpstreamException(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const name = err instanceof Error ? err.name : "";
  if (name === "AbortError" || name === "TimeoutError") {
    return new AppError(504, "upstream_timeout", "Upstream request timed out");
  }
  return new AppError(502, "upstream_error", "Upstream request failed");
}
