import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Element, PageGeometry } from "../../../domain/template-document";
import { Inspector } from "../components/Inspector";

const element: Element = { id: "label", type: "rectangle", x_mm: 10, y_mm: 20, width_mm: 40, height_mm: 30, rotation_degrees: 0, z_index: 0, visible: true, locked: false, style: { fill: { kind: "literal", value: "#ffffff" }, stroke: null, stroke_width_mm: 0 } };
const textElement: Element = { id: "text-label", type: "text", x_mm: 10, y_mm: 20, width_mm: 40, height_mm: 15, rotation_degrees: 0, z_index: 0, visible: true, locked: false, content: { kind: "literal", value: "A-01" }, style: { font_family: "Arial", font_size_pt: 18, font_weight: 400, font_style: "normal", horizontal_align: "left", vertical_align: "middle", line_height: 1, wrapping: "nowrap", overflow: "clip", fit_policy: "none", color: { kind: "literal", value: "#111111" } } };
const page: PageGeometry = { width_mm: 210, height_mm: 297, orientation: "portrait" };

describe("Inspector", () => {
  it("applies exact geometry as millimetres without converting it to screen pixels", () => {
    const onApplyGeometry = vi.fn();
    render(<Inspector element={element} page={page} onApplyGeometry={onApplyGeometry} onApplyPage={vi.fn()} />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "x (mm)" }), { target: { value: "22.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply geometry" }));
    expect(onApplyGeometry).toHaveBeenCalledWith("label", { x_mm: 22.5, y_mm: 20, width_mm: 40, height_mm: 30, rotation_degrees: 0 });
  });

  it("keeps invalid dimensions visible and refuses to mutate the document", () => {
    const onApplyGeometry = vi.fn();
    render(<Inspector element={element} page={page} onApplyGeometry={onApplyGeometry} onApplyPage={vi.fn()} />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "width (mm)" }), { target: { value: "-5" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply geometry" }));
    expect(screen.getByRole("alert")).toHaveTextContent("greater than zero");
    expect(screen.getByRole("spinbutton", { name: "width (mm)" })).toHaveValue(-5);
    expect(onApplyGeometry).not.toHaveBeenCalled();
  });

  it("rejects an invalid page size while preserving the entered value for correction", () => {
    const onApplyPage = vi.fn();
    render(<Inspector page={page} onApplyGeometry={vi.fn()} onApplyPage={onApplyPage} />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Page height (mm)" }), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply page size" }));
    expect(screen.getByRole("alert")).toHaveTextContent("finite positive millimetres");
    expect(screen.getByRole("spinbutton", { name: "Page height (mm)" })).toHaveValue(0);
    expect(onApplyPage).not.toHaveBeenCalled();
  });

  it("does not treat a blank position as zero during geometry apply", () => {
    const onApplyGeometry = vi.fn();
    render(<Inspector element={element} page={page} onApplyGeometry={onApplyGeometry} onApplyPage={vi.fn()} />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "x (mm)" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply geometry" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter finite numbers");
    expect(screen.getByRole("spinbutton", { name: "x (mm)" })).toHaveValue(null);
    expect(onApplyGeometry).not.toHaveBeenCalled();
  });

  it("does not treat an empty page width as zero", () => {
    const onApplyPage = vi.fn();
    render(<Inspector page={page} onApplyGeometry={vi.fn()} onApplyPage={onApplyPage} />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Page width (mm)" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply page size" }));
    expect(screen.getByRole("alert")).toHaveTextContent("finite positive millimetres");
    expect(onApplyPage).not.toHaveBeenCalled();
  });

  it("applies text content, font size, weight, and color as one edit", () => {
    const onApplyTextAuthoring = vi.fn();
    render(<Inspector element={textElement} page={page} onApplyGeometry={vi.fn()} onApplyPage={vi.fn()} onApplyTextAuthoring={onApplyTextAuthoring} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Text content" }), { target: { value: "B-04" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Font size (pt)" }), { target: { value: "24" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Font weight" }), { target: { value: "bold" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Horizontal alignment" }), { target: { value: "center" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Vertical alignment" }), { target: { value: "bottom" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Font style" }), { target: { value: "italic" } });
    fireEvent.change(screen.getByLabelText("Text color"), { target: { value: "#d40511" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply text style" }));
    expect(onApplyTextAuthoring).toHaveBeenCalledWith("text-label", { content: { kind: "literal", value: "B-04" }, font_size_pt: 24, font_weight: "bold", font_style: "italic", horizontal_align: "center", vertical_align: "bottom", color: { kind: "literal", value: "#d40511" } });
  });

  it("applies shape fill while preserving other styling in the command", () => {
    const onApplyShapeFill = vi.fn();
    render(<Inspector element={element} page={page} onApplyGeometry={vi.fn()} onApplyPage={vi.fn()} onApplyShapeFill={onApplyShapeFill} />);
    fireEvent.change(screen.getByLabelText("Shape fill"), { target: { value: "#ffcc00" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply shape fill" }));
    expect(onApplyShapeFill).toHaveBeenCalledWith("label", "#ffcc00");
  });

  it("preserves bound text and color when changing only font styling", () => {
    const onApplyTextAuthoring = vi.fn();
    const boundText: Element = { ...textElement, content: { kind: "binding", path: "visual.location" }, style: { ...textElement.style, color: { kind: "binding", path: "visual.accent_color" } } };
    render(<Inspector element={boundText} page={page} onApplyGeometry={vi.fn()} onApplyPage={vi.fn()} onApplyTextAuthoring={onApplyTextAuthoring} />);
    expect(screen.getByRole("textbox", { name: "Text content" })).toBeDisabled();
    expect(screen.getByLabelText("Text color")).toBeDisabled();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Font size (pt)" }), { target: { value: "28" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply text style" }));
    expect(onApplyTextAuthoring).toHaveBeenCalledWith("text-label", { content: { kind: "binding", path: "visual.location" }, font_size_pt: 28, font_weight: 400, font_style: "normal", horizontal_align: "left", vertical_align: "middle", color: { kind: "binding", path: "visual.accent_color" } });
  });

  it("keeps current alignment and font style when changing only the size", () => {
    const onApplyTextAuthoring = vi.fn();
    const centered: Element = { ...textElement, style: { ...textElement.style, horizontal_align: "center", vertical_align: "bottom", font_style: "italic" } };
    render(<Inspector element={centered} page={page} onApplyGeometry={vi.fn()} onApplyPage={vi.fn()} onApplyTextAuthoring={onApplyTextAuthoring} />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Font size (pt)" }), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply text style" }));
    expect(onApplyTextAuthoring).toHaveBeenCalledWith("text-label", { content: { kind: "literal", value: "A-01" }, font_size_pt: 20, font_weight: 400, font_style: "italic", horizontal_align: "center", vertical_align: "bottom", color: { kind: "literal", value: "#111111" } });
  });

  it("assigns and edits visual text and color bindings", () => {
    const onApplyTextAuthoring = vi.fn();
    render(<Inspector element={textElement} page={page} values={{ "visual.name": "Visual label", "visual.accent_color": "#d40511" }} onApplyGeometry={vi.fn()} onApplyPage={vi.fn()} onApplyTextAuthoring={onApplyTextAuthoring} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Text source" }), { target: { value: "visual.name" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Text color source" }), { target: { value: "visual.accent_color" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply text style" }));
    expect(onApplyTextAuthoring).toHaveBeenCalledWith("text-label", expect.objectContaining({ content: { kind: "binding", path: "visual.name" }, color: { kind: "binding", path: "visual.accent_color" } }));
    expect(screen.getByRole("textbox", { name: "Text content" })).toBeDisabled();
    expect(screen.getByLabelText("Text color")).toBeDisabled();
  });
});
