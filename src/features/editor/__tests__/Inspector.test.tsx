import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Element, PageGeometry } from "../../../domain/template-document";
import { Inspector } from "../components/Inspector";

const element: Element = { id: "label", type: "rectangle", x_mm: 10, y_mm: 20, width_mm: 40, height_mm: 30, rotation_degrees: 0, z_index: 0, visible: true, locked: false, style: { fill: { kind: "literal", value: "#fff" }, stroke: null, stroke_width_mm: 0 } };
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
});
