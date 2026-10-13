import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GridControls } from "../components/GridControls";

describe("GridControls", () => {
  it("exposes accessible snap, spacing, and visible-grid preferences", () => {
    const onSnapChange = vi.fn();
    const onStepChange = vi.fn();
    const onShowChange = vi.fn();
    render(<GridControls snapToGrid gridStepMm={1} showGrid={false} onSnapChange={onSnapChange} onStepChange={onStepChange} onShowChange={onShowChange} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Snap to grid" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Grid step (mm)" }), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Show grid" }));

    expect(onSnapChange).toHaveBeenCalledWith(false);
    expect(onStepChange).toHaveBeenCalledWith(5);
    expect(onShowChange).toHaveBeenCalledWith(true);
  });
});
