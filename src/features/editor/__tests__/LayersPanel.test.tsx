import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Element } from "../../../domain/template-document";
import { LayersPanel } from "../components/LayersPanel";

const elements: Element[] = [
  { id: "back", type: "rectangle", x_mm: 0, y_mm: 0, width_mm: 20, height_mm: 10, rotation_degrees: 0, z_index: 1, visible: true, locked: false, style: { fill: { kind: "literal", value: "#fff" }, stroke: null, stroke_width_mm: 0 } },
  { id: "front", type: "rectangle", x_mm: 0, y_mm: 0, width_mm: 10, height_mm: 10, rotation_degrees: 0, z_index: 2, visible: true, locked: true, style: { fill: { kind: "literal", value: "#000" }, stroke: null, stroke_width_mm: 0 } },
];

describe("LayersPanel", () => {
  it("provides accessible selection, visibility, lock, and ordering actions", () => {
    const onSelectElement = vi.fn();
    const onToggleVisibility = vi.fn();
    const onToggleLock = vi.fn();
    const onReorder = vi.fn();
    render(<LayersPanel elements={elements} selectedElementId="front" onSelectElement={onSelectElement} onToggleVisibility={onToggleVisibility} onToggleLock={onToggleLock} onReorder={onReorder} />);

    fireEvent.click(screen.getByRole("button", { name: "Select layer back" }));
    fireEvent.click(screen.getByRole("button", { name: "Hide back" }));
    fireEvent.click(screen.getByRole("button", { name: "Unlock front" }));
    fireEvent.click(screen.getByRole("button", { name: "Move back to front" }));

    expect(onSelectElement).toHaveBeenCalledWith("back");
    expect(onToggleVisibility).toHaveBeenCalledWith("back", false);
    expect(onToggleLock).toHaveBeenCalledWith("front", false);
    expect(onReorder).toHaveBeenCalledWith("back", "front");
  });
});
