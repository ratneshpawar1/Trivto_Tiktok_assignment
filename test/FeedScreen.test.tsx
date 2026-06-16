// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FeedScreen } from "../components/FeedScreen";
import type { FeedImage } from "../types";

class NoopIO {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
globalThis.IntersectionObserver = NoopIO as unknown as typeof IntersectionObserver;

function img(id: string): FeedImage {
  return {
    id,
    width: 1080,
    height: 1920,
    srcUrl: `https://images.pexels.com/${id}.jpg`,
    thumbUrl: `https://images.pexels.com/${id}-t.jpg`,
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

// A small stateful fake of the likes backend so the feed <-> liked flow works.
function fakeServer(feed: FeedImage[]) {
  const liked = new Map<string, FeedImage>();
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/likes/") && init?.method === "POST") {
      const id = url.split("/").pop()!;
      let image: FeedImage | undefined;
      if (typeof init.body === "string") {
        try {
          image = JSON.parse(init.body).image;
        } catch {
          /* none */
        }
      }
      let nowLiked: boolean;
      if (liked.has(id)) {
        liked.delete(id);
        nowLiked = false;
      } else {
        if (image) liked.set(id, image);
        nowLiked = true;
      }
      return jsonOk({ id, liked: nowLiked });
    }
    if (url.startsWith("/api/likes")) {
      const ids = [...liked.keys()];
      return url.includes("full")
        ? jsonOk({ likedIds: ids, items: [...liked.values()] })
        : jsonOk({ likedIds: ids });
    }
    if (url.startsWith("/api/feed")) {
      return jsonOk({ items: feed, nextPage: null });
    }
    throw new Error("unexpected url " + url);
  });
  return fetchMock;
}

beforeEach(() => {
  window.sessionStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("FeedScreen", () => {
  it("shows the Feed view by default with the tabs", async () => {
    vi.stubGlobal("fetch", fakeServer([img("1")]));
    render(<FeedScreen />);

    await waitFor(() =>
      expect(screen.getAllByTestId("feed-slide").length).toBeGreaterThan(0),
    );
    expect(screen.getByRole("button", { name: /^Feed$/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("likes a photo in the feed and shows it in the Liked view; unliking removes it", async () => {
    vi.stubGlobal("fetch", fakeServer([img("1")]));
    render(<FeedScreen />);

    // like in the feed
    const likeBtn = await screen.findByRole("button", { name: "Like photo" });
    await userEvent.click(likeBtn);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Unlike photo" }),
      ).toHaveAttribute("aria-pressed", "true"),
    );

    // switch to the Liked view -> the liked photo is there
    await userEvent.click(screen.getByRole("button", { name: /Liked/ }));
    const likedFeed = await screen.findByTestId("liked-feed");
    expect(within(likedFeed).getByText("Author 1")).toBeInTheDocument();

    // unlike from the Liked view -> it disappears, empty state shows
    await userEvent.click(
      within(likedFeed).getByRole("button", { name: "Unlike photo" }),
    );
    await waitFor(() =>
      expect(screen.getByText("No liked photos yet")).toBeInTheDocument(),
    );
  });

  it("supports arrow-key navigation in the Liked view", async () => {
    const fetchMock = fakeServer([img("1"), img("2")]);
    // Pre-like both so the Liked view has two slides.
    vi.stubGlobal("fetch", fetchMock);
    render(<FeedScreen />);

    // like both photos in the feed
    const slides = await screen.findAllByTestId("feed-slide");
    for (const s of slides) {
      fireEvent.click(s);
      fireEvent.click(s); // double-tap like
    }
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Liked/ })).toHaveTextContent("2"),
    );

    await userEvent.click(screen.getByRole("button", { name: /Liked/ }));
    const likedFeed = await screen.findByTestId("liked-feed");

    Object.defineProperty(likedFeed, "clientHeight", {
      value: 800,
      configurable: true,
    });
    Object.defineProperty(likedFeed, "scrollTop", {
      value: 0,
      writable: true,
      configurable: true,
    });
    const scrollTo = vi.fn();
    (likedFeed as unknown as { scrollTo: typeof scrollTo }).scrollTo = scrollTo;

    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 800 }));
  });

  it("shows an empty Liked view when nothing is liked", async () => {
    vi.stubGlobal("fetch", fakeServer([img("1")]));
    render(<FeedScreen />);
    await screen.findByRole("button", { name: "Like photo" });

    await userEvent.click(screen.getByRole("button", { name: /Liked/ }));
    await waitFor(() =>
      expect(screen.getByText("No liked photos yet")).toBeInTheDocument(),
    );
  });
});
