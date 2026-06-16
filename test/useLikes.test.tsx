// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useLikes } from "../hooks/useLikes";

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
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

describe("useLikes", () => {
  it("hydrates liked ids from the server on mount", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonOk({ likedIds: ["7", "42"] })),
    );

    const { result } = renderHook(() => useLikes());
    await waitFor(() => expect(result.current.isLiked("7")).toBe(true));
    expect(result.current.isLiked("42")).toBe(true);
    expect(result.current.isLiked("99")).toBe(false);
  });

  it("toggles optimistically, then reconciles to the server state", async () => {
    const fetchMock = vi.fn((url: string, opts?: RequestInit) => {
      if (url === "/api/likes") return Promise.resolve(jsonOk({ likedIds: [] }));
      // POST /api/likes/5
      expect(opts?.method).toBe("POST");
      return Promise.resolve(jsonOk({ id: "5", liked: true }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useLikes());
    await act(async () => {}); // flush hydrate

    act(() => result.current.toggle("5"));
    expect(result.current.isLiked("5")).toBe(true); // optimistic, immediate

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/likes/5",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await act(async () => {}); // flush reconcile
    expect(result.current.isLiked("5")).toBe(true); // server agreed
  });

  it("rolls back the optimistic toggle when the request fails", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/likes") return Promise.resolve(jsonOk({ likedIds: [] }));
      return Promise.reject(new Error("network down")); // POST fails
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useLikes());
    await act(async () => {});

    act(() => result.current.toggle("5"));
    expect(result.current.isLiked("5")).toBe(true); // optimistic

    await waitFor(() => expect(result.current.isLiked("5")).toBe(false)); // rolled back
  });

  it("rolls an un-like back to liked when the request fails", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/likes")
        return Promise.resolve(jsonOk({ likedIds: ["5"] }));
      return Promise.reject(new Error("network down"));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useLikes());
    await waitFor(() => expect(result.current.isLiked("5")).toBe(true));

    act(() => result.current.toggle("5"));
    expect(result.current.isLiked("5")).toBe(false); // optimistic un-like

    await waitFor(() => expect(result.current.isLiked("5")).toBe(true)); // restored
  });
});
