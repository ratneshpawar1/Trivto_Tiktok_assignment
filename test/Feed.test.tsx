// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Feed } from "../components/Feed";
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

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
function feedRes(items: FeedImage[], nextPage: number | null): Response {
  return jsonOk({ items, nextPage });
}

// ---- IntersectionObserver mock ----------------------------------------------
let ioCallbacks: Array<(entries: { isIntersecting: boolean }[]) => void> = [];
class MockIO {
  constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
    ioCallbacks.push(cb);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
function triggerSentinel() {
  ioCallbacks.at(-1)?.([{ isIntersecting: true }]);
}
// Install the capturing observer once, by direct assignment (NOT vi.stubGlobal),
// so it survives passive-effect flushes during teardown and is never undefined.
globalThis.IntersectionObserver = MockIO as unknown as typeof IntersectionObserver;

// ---- fetch router -----------------------------------------------------------
interface RouteOpts {
  likes?: string[];
  feed?: (page: number, callIndex: number) => Response;
  feedPending?: boolean;
  toggle?: (id: string) => Response;
}
function routeFetch(opts: RouteOpts) {
  let feedCalls = 0;
  return vi.fn((url: string, init?: RequestInit) => {
    if (url === "/api/likes") {
      return Promise.resolve(jsonOk({ likedIds: opts.likes ?? [] }));
    }
    if (url.startsWith("/api/feed")) {
      if (opts.feedPending) return new Promise<Response>(() => {});
      const page = Number(
        new URL("http://x" + url).searchParams.get("page") ?? "1",
      );
      return Promise.resolve(
        opts.feed ? opts.feed(page, feedCalls++) : feedRes([], null),
      );
    }
    if (url.startsWith("/api/likes/")) {
      const id = url.split("/").pop()!;
      void init;
      return Promise.resolve(opts.toggle ? opts.toggle(id) : jsonOk({ id, liked: true }));
    }
    return Promise.reject(new Error("unexpected url " + url));
  });
}

beforeEach(() => {
  ioCallbacks = [];
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals(); // clears the per-test fetch stub
});

describe("Feed", () => {
  it("shows the initial loading state while the first page loads", () => {
    vi.stubGlobal("fetch", routeFetch({ feedPending: true }));
    render(<Feed />);
    expect(screen.getByText("Loading photos…")).toBeInTheDocument();
  });

  it("renders one slide per image with attribution", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({ feed: () => feedRes([img("1"), img("2")], null) }),
    );
    render(<Feed />);

    await waitFor(() =>
      expect(screen.getAllByTestId("feed-slide")).toHaveLength(2),
    );
    expect(screen.getByText("Author 1")).toBeInTheDocument();
    expect(screen.getByText("Author 2")).toBeInTheDocument();
  });

  it("shows the empty state when the feed returns no images", async () => {
    vi.stubGlobal("fetch", routeFetch({ feed: () => feedRes([], null) }));
    render(<Feed />);
    await waitFor(() =>
      expect(screen.getByText("No photos yet")).toBeInTheDocument(),
    );
  });

  it("shows a rate-limited error and recovers on retry", async () => {
    const err503 = () =>
      new Response(JSON.stringify({ error: "rate_limited", retryAfter: 20 }), {
        status: 503,
      });
    vi.stubGlobal(
      "fetch",
      routeFetch({
        feed: (_p, call) => (call === 0 ? err503() : feedRes([img("1")], null)),
      }),
    );
    render(<Feed />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Too many requests");
    expect(alert).toHaveAttribute("data-error-kind", "rate_limited");

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(screen.getAllByTestId("feed-slide")).toHaveLength(1),
    );
  });

  it("distinguishes a generic error from a rate-limited one", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({ feed: () => new Response("boom", { status: 502 }) }),
    );
    render(<Feed />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Something went wrong");
    expect(alert).toHaveAttribute("data-error-kind", "generic");
  });

  it("toggles a like from the UI", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        feed: () => feedRes([img("1")], null),
        likes: [],
        toggle: (id) => jsonOk({ id, liked: true }),
      }),
    );
    render(<Feed />);

    const likeBtn = await screen.findByRole("button", { name: "Like photo" });
    expect(likeBtn).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(likeBtn);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Unlike photo" }),
      ).toHaveAttribute("aria-pressed", "true"),
    );
  });

  it("loads the next page when the sentinel intersects (before the bottom)", async () => {
    const fetchMock = routeFetch({
      feed: (page) =>
        page === 1 ? feedRes([img("1")], 2) : feedRes([img("2")], null),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Feed />);

    await waitFor(() =>
      expect(screen.getAllByTestId("feed-slide")).toHaveLength(1),
    );

    await act(async () => {
      triggerSentinel();
    });

    await waitFor(() =>
      expect(screen.getAllByTestId("feed-slide")).toHaveLength(2),
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/feed?page=2");
  });

  it("navigates to the next slide on ArrowDown", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        feed: () => feedRes([img("1"), img("2"), img("3")], null),
      }),
    );
    render(<Feed />);
    await waitFor(() =>
      expect(screen.getAllByTestId("feed-slide")).toHaveLength(3),
    );

    const container = screen.getByTestId("feed");
    Object.defineProperty(container, "clientHeight", {
      value: 800,
      configurable: true,
    });
    Object.defineProperty(container, "scrollTop", {
      value: 0,
      writable: true,
      configurable: true,
    });
    const scrollTo = vi.fn();
    // jsdom doesn't implement scrollTo.
    (container as unknown as { scrollTo: typeof scrollTo }).scrollTo = scrollTo;

    fireEvent.keyDown(window, { key: "ArrowDown" });

    expect(scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ top: 800 }),
    );
  });
});
