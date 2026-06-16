// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LikeButton } from "../components/LikeButton";

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
});
