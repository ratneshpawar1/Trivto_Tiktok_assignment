// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LikeButton } from "../components/LikeButton";

const popClass = (el: Element) =>
  Array.from(el.classList).some((c) => c.includes("pop"));

describe("LikeButton", () => {
  it("reflects the unliked state accessibly", () => {
    render(<LikeButton liked={false} onToggle={() => {}} />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-pressed", "false");
    expect(btn).toHaveAccessibleName("Like photo");
  });

  it("reflects the liked state accessibly", () => {
    render(<LikeButton liked={true} onToggle={() => {}} />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-pressed", "true");
    expect(btn).toHaveAccessibleName("Unlike photo");
  });

  it("calls onToggle when clicked", async () => {
    const onToggle = vi.fn();
    render(<LikeButton liked={false} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("does NOT carry the pop animation on a freshly-rendered liked button", () => {
    // This is the Liked-tab -> Feed bug: a liked button must not animate just
    // because it (re)appears.
    render(<LikeButton liked={true} onToggle={() => {}} />);
    const icon = screen.getByRole("button").querySelector("svg")!;
    expect(popClass(icon)).toBe(false);
  });

  it("adds the pop animation only on a click-to-like", () => {
    render(<LikeButton liked={false} onToggle={() => {}} />);
    const icon = screen.getByRole("button").querySelector("svg")!;
    expect(popClass(icon)).toBe(false);

    fireEvent.click(screen.getByRole("button"));
    expect(popClass(icon)).toBe(true); // transient class applied on the like
  });
});
