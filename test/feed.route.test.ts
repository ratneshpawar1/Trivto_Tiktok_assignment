import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../app/api/feed/route";

// Each scenario uses a DISTINCT page so the route's module-scoped TTL cache
// doesn't leak results between tests.
function req(page: string): NextRequest {
  return new NextRequest(`http://localhost/api/feed?page=${page}`);
}

function pexelsOk(nextPage: boolean) {
  return new Response(
    JSON.stringify({
      photos: [
        {
          id: 1,
          width: 800,
          height: 1200,
          photographer: "Ada",
          alt: "x",
          src: { portrait: "https://images.pexels.com/p.jpg", tiny: "https://images.pexels.com/t.jpg" },
        },
      ],
      next_page: nextPage ? "https://api.pexels.com/v1/curated/?page=99" : undefined,
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-ratelimit-remaining": "199",
        "x-ratelimit-reset": "1700000000",
      },
    },
  );
}

beforeEach(() => {
  process.env.IMAGE_SOURCE = "pexels";
  process.env.PEXELS_API_KEY = "test-key";
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("GET /api/feed", () => {
  it("returns a normalized FeedResponse on upstream success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(pexelsOk(true)));

    const res = await GET(req("1"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      id: "1",
      srcUrl: "https://images.pexels.com/p.jpg",
      author: "Ada",
    });
    expect(body.nextPage).toBe(2);
    expect(res.headers.get("x-feed-cache")).toBe("miss");
    expect(res.headers.get("x-ratelimit-remaining")).toBe("199");
    expect(res.headers.get("x-ratelimit-reset")).toBe("1700000000");
  });

  it("coalesces concurrent cold-cache requests into a single upstream call", async () => {
    // Mock resolves on a later tick so all requests overlap before the first
    // settles — without coalescing each would fire its own fetch.
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) =>
          setTimeout(() => resolve(pexelsOk(false)), 20),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const responses = await Promise.all([
      GET(req("50")),
      GET(req("50")),
      GET(req("50")),
      GET(req("50")),
      GET(req("50")),
    ]);

    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1); // one upstream hit for 5 callers
  });

  it("serves a cached page on the second identical request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(pexelsOk(false));
    vi.stubGlobal("fetch", fetchMock);

    const first = await GET(req("7"));
    expect(first.headers.get("x-feed-cache")).toBe("miss");

    const second = await GET(req("7"));
    expect(second.headers.get("x-feed-cache")).toBe("hit");
    expect(fetchMock).toHaveBeenCalledTimes(1); // upstream hit once
  });

  it("maps upstream 429 -> 503 rate_limited with retryAfter", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("rate limited", {
          status: 429,
          headers: { "retry-after": "12" },
        }),
      ),
    );

    const res = await GET(req("2"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("rate_limited");
    expect(body.retryAfter).toBe(12);
    expect(res.headers.get("retry-after")).toBe("12");
  });

  it("maps upstream 500 -> 502 upstream_error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("boom", { status: 500 })),
    );

    const res = await GET(req("3"));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("upstream_error");
  });

  it("rejects a malformed page with 400 before calling upstream", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(req("abc"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
