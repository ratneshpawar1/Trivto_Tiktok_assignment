// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FeedSlide } from "../components/FeedSlide";
import type { FeedImage } from "../types";

const image: FeedImage = {
  id: "1",
  width: 1080,
  height: 1920,
  srcUrl: "https://img/1.jpg",
  thumbUrl: "https://img/1-t.jpg",
  author: "Ada",
  alt: "a tower at dusk",
};

describe("FeedSlide", () => {
  it("renders attribution and the like control", () => {
    render(<FeedSlide image={image} liked={false} onToggleLike={() => {}} />);
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Like photo" })).toBeInTheDocument();
  });

  it("fades the image in once it loads", () => {
    render(<FeedSlide image={image} liked={false} onToggleLike={() => {}} />);
    const img = screen.getByAltText("a tower at dusk");
    expect(img.className).not.toMatch(/loaded/);
    fireEvent.load(img);
    expect(img.className).toMatch(/loaded/);
  });

  it("shows a fallback with retry when the image fails, and retries", async () => {
    render(<FeedSlide image={image} liked={false} onToggleLike={() => {}} />);
    const img = screen.getByAltText("a tower at dusk");

    fireEvent.error(img);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load image");

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    // Fallback clears and the image is re-requested with a cache-busting param.
    expect(screen.queryByText("Couldn't load image")).not.toBeInTheDocument();
    const retried = screen.getByAltText("a tower at dusk");
    expect(retried.getAttribute("src")).toContain("retry=1");
  });

  it("toggles the like on a double-tap (and ignores a single tap)", () => {
    const onToggle = vi.fn();
    render(<FeedSlide image={image} liked={false} onToggleLike={onToggle} />);
    const slide = screen.getByTestId("feed-slide");

    fireEvent.click(slide);
    expect(onToggle).not.toHaveBeenCalled(); // single tap does nothing

    fireEvent.click(slide); // second tap within the double-tap window
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("shows a heart burst on a double-tap like (transient, keyed for unmount)", () => {
    render(<FeedSlide image={image} liked={false} onToggleLike={() => {}} />);
    const slide = screen.getByTestId("feed-slide");
    const before = slide.querySelectorAll("svg").length;

    fireEvent.click(slide);
    fireEvent.click(slide);

    // Burst element appears; it carries onAnimationEnd to unmount itself so it
    // can't replay when the slide is re-shown (the Liked-tab -> Feed bug). The
    // animationend reset itself is verified live (jsdom can't drive it).
    const burst = slide.querySelector('div[aria-hidden="true"][class*="burst"]');
    expect(burst).not.toBeNull();
    expect(slide.querySelectorAll("svg").length).toBe(before + 1);
  });

  it("does not render a burst on first paint (so re-show can't replay one)", () => {
    render(<FeedSlide image={image} liked={true} onToggleLike={() => {}} />);
    const slide = screen.getByTestId("feed-slide");
    expect(
      slide.querySelector('div[aria-hidden="true"][class*="burst"]'),
    ).toBeNull();
  });

  it("does not let a like-button tap trigger the slide double-tap", () => {
    const onToggle = vi.fn();
    render(<FeedSlide image={image} liked={false} onToggleLike={onToggle} />);
    const btn = screen.getByRole("button", { name: "Like photo" });

    fireEvent.click(btn);
    fireEvent.click(btn);

    // Two button clicks => exactly two toggles. If propagation weren't stopped,
    // the slide handler would also fire a double-tap toggle (a 3rd call).
    expect(onToggle).toHaveBeenCalledTimes(2);
  });
});
