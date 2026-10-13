import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TemplateDocument } from "../../../domain/template-document";
import { buildTemplateRenderScene } from "../../../rendering/render-scene";
import { renderTemplateSceneSvg } from "../../../rendering/svg-renderer";
import { Artboard } from "../components/Artboard";
import type { Viewport } from "../geometry/viewport";

const document: TemplateDocument = {
  schema_version: 1,
  page: { width_mm: 210, height_mm: 297, orientation: "portrait" },
  print_rules: { copies_per_page: 2, margins_mm: { top: 5, right: 5, bottom: 5, left: 5 }, gap_mm: 3, slots: { rows: 2, columns: 1 } },
  repetition: { kind: "none" },
  defaults: {},
  elements: [{
    id: "location", type: "text", x_mm: 10, y_mm: 14, width_mm: 80, height_mm: 18, rotation_degrees: 0,
    z_index: 1, visible: true, locked: false,
    content: { kind: "literal", value: "A-01" },
    style: { font_family: "Delivery", font_size_pt: 24, font_weight: 700, font_style: "normal", horizontal_align: "left", vertical_align: "middle", line_height: 1,
      wrapping: "nowrap", overflow: "clip", fit_policy: "none", color: { kind: "literal", value: "#D40511" } },
  }],
};
const documentWithTarget: TemplateDocument = {
  ...document,
  elements: [document.elements[0], { ...document.elements[0], id: "target", x_mm: 100, y_mm: 14, width_mm: 50, z_index: 2 }],
};

describe("Artboard", () => {
  it("renders the canonical document in millimetres at the selected viewport scale", () => {
    const viewport: Viewport = { zoom: 1, pxPerMm: 96 / 25.4, pan: { x: 0, y: 0 } };
    render(<Artboard document={document} viewport={viewport} />);
    const page = screen.getByRole("group", { name: "Template artboard" });
    expect(page).toHaveAttribute("viewBox", "0 0 210 297");
    expect(Number(page.getAttribute("width"))).toBeCloseTo(210 * 96 / 25.4, 5);
    expect(Number(page.getAttribute("height"))).toBeCloseTo(297 * 96 / 25.4, 5);
    expect(Number(page.getAttribute("width"))! / Number(page.getAttribute("height"))!).toBeCloseTo(210 / 297, 10);
    expect(screen.getByText("A-01")).toBeVisible();
  });

  it("uses the same safe resolved color fallback as SVG export for invalid binding values", () => {
    const textElement = document.elements[0];
    if (textElement.type !== "text") throw new Error("Fixture must begin with a text element.");
    const boundDocument: TemplateDocument = {
      ...document,
      elements: [{ ...textElement, style: { ...textElement.style, color: { kind: "binding", path: "visual.accent_color" } } }],
    };
    const values = { "visual.accent_color": "url(https://invalid.example/paint.svg#x)" };
    const scene = buildTemplateRenderScene({ document: boundDocument, values, ariaLabel: "Canvas" });
    const exportedText = new DOMParser().parseFromString(renderTemplateSceneSvg(scene).svg, "image/svg+xml").querySelector("text");
    render(<Artboard document={boundDocument} viewport={{ zoom: 1, pxPerMm: 96 / 25.4, pan: { x: 0, y: 0 } }} values={values} />);
    const canvasText = screen.getByText("A-01");
    expect(canvasText).toHaveAttribute("fill", exportedText?.getAttribute("fill"));
    expect(canvasText).toHaveAttribute("x", exportedText?.getAttribute("x"));
    expect(canvasText).toHaveAttribute("y", exportedText?.getAttribute("y"));
    expect(canvasText).toHaveAttribute("font-size", exportedText?.getAttribute("font-size"));
  });

  it("selects an element accessibly without writing screen coordinates into the document", () => {
    const onSelectElement = vi.fn();
    const onNudgeElement = vi.fn();
    const before = structuredClone(document);
    render(<Artboard document={document} viewport={{ zoom: 4, pxPerMm: 96 / 25.4, pan: { x: 3, y: -2 } }} onSelectElement={onSelectElement} onNudgeElement={onNudgeElement} />);
    const text = screen.getByRole("button", { name: "Select text: A-01" });
    fireEvent.keyDown(text, { key: "Enter" });
    fireEvent.keyDown(text, { key: "ArrowUp", shiftKey: true });

    expect(onSelectElement).toHaveBeenCalledWith("location");
    expect(onNudgeElement).toHaveBeenCalledWith("location", 0, -10);
    expect(document).toEqual(before);
  });

  it("selects the focused element so keyboard nudging updates the inspector target", () => {
    const onSelectElement = vi.fn();
    const onNudgeElement = vi.fn();
    render(<Artboard document={document} viewport={{ zoom: 1, pxPerMm: 96 / 25.4, pan: { x: 0, y: 0 } }} onSelectElement={onSelectElement} onNudgeElement={onNudgeElement} />);
    const text = screen.getByRole("button", { name: "Select text: A-01" });
    fireEvent.focus(text);
    fireEvent.keyDown(text, { key: "ArrowRight" });
    expect(onSelectElement).toHaveBeenCalledWith("location");
    expect(onNudgeElement).toHaveBeenCalledWith("location", 1, 0);
  });

  it("uses the configured grid step for Alt+Arrow movement", () => {
    const onNudgeElement = vi.fn();
    render(<Artboard document={document} viewport={{ zoom: 1, pxPerMm: 96 / 25.4, pan: { x: 0, y: 0 } }} gridStepMm={5} onNudgeElement={onNudgeElement} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Select text: A-01" }), { key: "ArrowRight", altKey: true });
    expect(onNudgeElement).toHaveBeenCalledWith("location", 5, 0);
  });

  it("commits a drag as a millimetre delta on pointer release", () => {
    const onMoveElement = vi.fn();
    render(<Artboard document={document} viewport={{ zoom: 1, pxPerMm: 96 / 25.4, pan: { x: 8, y: -3 } }} onMoveElement={onMoveElement} />);
    const text = screen.getByRole("button", { name: "Select text: A-01" });
    fireEvent.pointerDown(text, { pointerId: 7, button: 0, clientX: 30, clientY: 50 });
    fireEvent.pointerMove(text, { pointerId: 7, clientX: 30 + 8 * 96 / 25.4, clientY: 50 });
    fireEvent.pointerUp(text, { pointerId: 7, clientX: 30 + 8 * 96 / 25.4, clientY: 50 });
    expect(onMoveElement).toHaveBeenCalledWith("location", expect.closeTo(8, 8), 0);
  });

  it.each([0.25, 1, 4])("keeps drag geometry physical at %s zoom", (zoom) => {
    const onMoveElement = vi.fn();
    const pxPerMm = 96 / 25.4;
    render(<Artboard document={document} viewport={{ zoom, pxPerMm, pan: { x: -14, y: 21 } }} onMoveElement={onMoveElement} />);
    const text = screen.getByRole("button", { name: "Select text: A-01" });
    fireEvent.pointerDown(text, { pointerId: 70, button: 0, clientX: 3, clientY: 4 });
    fireEvent.pointerUp(text, { pointerId: 70, clientX: 3 + 8 * pxPerMm * zoom, clientY: 4 });
    expect(onMoveElement).toHaveBeenCalledWith("location", expect.closeTo(8, 8), 0);
  });

  it("snaps pointer movement to the configured millimetre grid when enabled", () => {
    const onMoveElement = vi.fn();
    const pxPerMm = 96 / 25.4;
    render(<Artboard document={document} viewport={{ zoom: 1, pxPerMm, pan: { x: 0, y: 0 } }} snapToGrid gridStepMm={5} onMoveElement={onMoveElement} />);
    const text = screen.getByRole("button", { name: "Select text: A-01" });
    fireEvent.pointerDown(text, { pointerId: 80, button: 0, clientX: 4, clientY: 7 });
    fireEvent.pointerUp(text, { pointerId: 80, clientX: 4 + 8 * pxPerMm, clientY: 7 });
    expect(onMoveElement).toHaveBeenCalledWith("location", 10, 1);
  });

  it("does not snap an element when the pointer is released without moving", () => {
    const onMoveElement = vi.fn();
    render(<Artboard document={document} viewport={{ zoom: 1, pxPerMm: 96 / 25.4, pan: { x: 0, y: 0 } }} snapToGrid gridStepMm={5} onMoveElement={onMoveElement} />);
    const text = screen.getByRole("button", { name: "Select text: A-01" });
    fireEvent.pointerDown(text, { pointerId: 82, button: 0, clientX: 4, clientY: 7 });
    fireEvent.pointerUp(text, { pointerId: 82, clientX: 4, clientY: 7 });
    expect(onMoveElement).not.toHaveBeenCalled();
  });

  it("snaps a dragged resize edge without changing the opposite anchor", () => {
    const onResizeElement = vi.fn();
    const pxPerMm = 96 / 25.4;
    render(<Artboard document={document} viewport={{ zoom: 1, pxPerMm, pan: { x: 0, y: 0 } }} selectedElementId="location" snapToGrid gridStepMm={5} onResizeElement={onResizeElement} />);
    const east = screen.getByRole("button", { name: /Resize location e;/ });
    fireEvent.pointerDown(east, { pointerId: 81, button: 0, clientX: 4, clientY: 7 });
    fireEvent.pointerUp(east, { pointerId: 81, clientX: 4 + 8 * pxPerMm, clientY: 7 });
    expect(onResizeElement).toHaveBeenCalledWith("location", "e", 10, 0);
  });

  it("shows an active alignment guide and snaps a moving edge within three screen pixels", () => {
    const onMoveElement = vi.fn();
    const onGuideHint = vi.fn();
    const pxPerMm = 96 / 25.4;
    render(<Artboard document={documentWithTarget} viewport={{ zoom: 1, pxPerMm, pan: { x: 0, y: 0 } }} snapToGuides guideTolerancePx={3} onGuideHint={onGuideHint} onMoveElement={onMoveElement} />);
    const text = screen.getAllByRole("button", { name: "Select text: A-01" })[0];
    fireEvent.pointerDown(text, { pointerId: 83, button: 0, clientX: 4, clientY: 7 });
    fireEvent.pointerMove(text, { pointerId: 83, clientX: 4 + 9.5 * pxPerMm, clientY: 7 });
    expect(screen.getByTestId("alignment-guide-x")).toHaveAttribute("x1", "100");
    expect(onGuideHint).toHaveBeenCalledWith("Aligned to target left edge and target top edge");
    fireEvent.pointerUp(text, { pointerId: 83, clientX: 4 + 9.5 * pxPerMm, clientY: 7 });
    expect(onMoveElement).toHaveBeenCalledWith("location", expect.closeTo(10, 8), 0);
  });

  it("draws a visible millimetre grid only when requested", () => {
    const { rerender } = render(<Artboard document={document} viewport={{ zoom: 1, pxPerMm: 96 / 25.4, pan: { x: 0, y: 0 } }} gridStepMm={5} />);
    const page = screen.getByRole("group", { name: "Template artboard" });
    expect(page.querySelector(".artboard-grid" )).toBeNull();
    rerender(<Artboard document={document} viewport={{ zoom: 1, pxPerMm: 96 / 25.4, pan: { x: 0, y: 0 } }} gridStepMm={5} showGrid />);
    expect(page.querySelector(".artboard-grid")).toHaveAttribute("fill", "url(#artboard-grid-pattern)");
  });

  it("routes resize-handle gestures to the typed resize callback", () => {
    const onResizeElement = vi.fn();
    render(<Artboard document={document} viewport={{ zoom: 0.25, pxPerMm: 96 / 25.4, pan: { x: 0, y: 0 } }} selectedElementId="location" onResizeElement={onResizeElement} />);
    const east = screen.getByRole("button", { name: /Resize location e;/ });
    fireEvent.pointerDown(east, { pointerId: 8, button: 0, clientX: 5, clientY: 15 });
    fireEvent.pointerUp(east, { pointerId: 8, clientX: 5, clientY: 15 + 2 * 96 / 25.4 * 0.25 });
    expect(onResizeElement).toHaveBeenCalledWith("location", "e", 0, expect.closeTo(2, 8));
  });

  it.each([0.25, 1, 4])("keeps resize targets at least 24 CSS pixels at %s zoom", (zoom) => {
    render(<Artboard document={document} viewport={{ zoom, pxPerMm: 96 / 25.4, pan: { x: 0, y: 0 } }} selectedElementId="location" />);
    const east = screen.getByRole("button", { name: /Resize location e;/ });
    const radiusMm = Number(east.getAttribute("r"));
    expect(radiusMm * (96 / 25.4) * zoom * 2).toBeCloseTo(24, 5);
  });

  it("makes focused resize handles keyboard-operable with millimetre steps", () => {
    const onResizeElement = vi.fn();
    render(<Artboard document={document} viewport={{ zoom: 1, pxPerMm: 96 / 25.4, pan: { x: 0, y: 0 } }} selectedElementId="location" onResizeElement={onResizeElement} />);
    const east = screen.getByRole("button", { name: /Resize location e;/ });
    fireEvent.keyDown(east, { key: "ArrowRight", shiftKey: true });
    expect(onResizeElement).toHaveBeenCalledWith("location", "e", 10, 0);
  });
});
