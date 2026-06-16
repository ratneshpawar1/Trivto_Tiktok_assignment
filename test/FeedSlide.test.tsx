// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
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
});
