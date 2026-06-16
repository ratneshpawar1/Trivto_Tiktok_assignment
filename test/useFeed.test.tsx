// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useFeed } from "../hooks/useFeed";
import type { FeedImage } from "../types";

function img(id: string): FeedImage {
  return {
    id,
    width: 1080,
    height: 1920,
    srcUrl: `https://img/${id}.jpg`,
    thumbUrl: `https://img/${id}-t.jpg`,
    author: `Author ${id}`,
    alt: `alt ${id}`,
  };
}

function feedRes(items: FeedImage[], nextPage: number | null): Response {
  return new Response(JSON.stringify({ items, nextPage }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useFeed", () => {
  it("loads the first page on mount", async () => {
    const fetchMock = vi.fn().mockResolvedValue(feedRes([img("1")], 2));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useFeed());

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/feed?page=1");
    expect(result.current.hasMore).toBe(true);
    expect(result.current.isLoadingInitial).toBe(false);
  });

  it("appends the next page and tracks the cursor", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(feedRes([img("1"), img("2")], 2))
      .mockResolvedValueOnce(feedRes([img("3")], null));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useFeed());
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(3));

    expect(fetchMock).toHaveBeenLastCalledWith("/api/feed?page=2");
    expect(result.current.items.map((i) => i.id)).toEqual(["1", "2", "3"]);
    expect(result.current.hasMore).toBe(false);
  });

  it("de-dupes images that overlap across pages", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(feedRes([img("1"), img("2")], 2))
      .mockResolvedValueOnce(feedRes([img("2"), img("3")], null)); // 2 repeats
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useFeed());
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(3));

    expect(result.current.items.map((i) => i.id)).toEqual(["1", "2", "3"]);
  });

  it("does not start a second fetch while one is in flight", async () => {
    let resolve!: (r: Response) => void;
    const fetchMock = vi
      .fn()
      .mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useFeed());
    // Initial fetch is pending; a loadMore must be a no-op.
    act(() => result.current.loadMore());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve(feedRes([img("1")], null));
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
  });

  it("does not fetch past the end of the feed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(feedRes([img("1")], null));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useFeed());
    await waitFor(() => expect(result.current.hasMore).toBe(false));

    act(() => result.current.loadMore());
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the initial load
  });

  it("classifies a 503 as a rate_limited error with retryAfter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "rate_limited", retryAfter: 30 }), {
        status: 503,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useFeed());
    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.error?.kind).toBe("rate_limited");
    expect(result.current.error?.retryAfter).toBe(30);
    expect(result.current.isLoadingInitial).toBe(false);
  });

  it("classifies other failures as generic", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "upstream_error" }), { status: 502 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useFeed());
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.kind).toBe("generic");
  });

  it("treats a network throw as a generic error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useFeed());
    await waitFor(() => expect(result.current.error?.kind).toBe("generic"));
  });

  it("recovers after retry()", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("boom", { status: 500 }))
      .mockResolvedValueOnce(feedRes([img("1")], null));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useFeed());
    await waitFor(() => expect(result.current.error).not.toBeNull());

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.error).toBeNull();
  });
});
