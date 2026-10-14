import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ViewportControls } from "../components/ViewportControls";

describe("ViewportControls", () => {
  it("offers physical preview zoom levels with accessible selected state", () => {
    const onZoomChange = vi.fn();
    render(<ViewportControls zoom={1} onZoomChange={onZoomChange} />);
    expect(screen.getByRole("group", { name: "Artboard zoom" })).toBeVisible();
    expect(screen.getByRole("button", { name: "100%" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "400%" }));
    expect(onZoomChange).toHaveBeenCalledWith(4);
  });
});
