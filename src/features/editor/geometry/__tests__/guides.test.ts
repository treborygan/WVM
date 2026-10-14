import { describe, expect, it } from "vitest";

import type { TemplateDocument } from "../../../../domain/template-document";
import { snapMoveToGuides, snapResizeToGuides } from "../guides";

const document: TemplateDocument = {
  schema_version: 1,
  page: { width_mm: 210, height_mm: 297, orientation: "portrait" },
  print_rules: { copies_per_page: 2, margins_mm: { top: 5, right: 5, bottom: 5, left: 5 }, gap_mm: 3, slots: { rows: 2, columns: 1 } },
  repetition: { kind: "none" },
  defaults: {},
  elements: [
    { id: "moving", type: "rectangle", x_mm: 10, y_mm: 20, width_mm: 80, height_mm: 30, rotation_degrees: 0, z_index: 0, visible: true, locked: false, style: { fill: { kind: "literal", value: "#fff" }, stroke: null, stroke_width_mm: 0 } },
    { id: "target", type: "rectangle", x_mm: 100, y_mm: 20, width_mm: 50, height_mm: 30, rotation_degrees: 0, z_index: 1, visible: true, locked: false, style: { fill: { kind: "literal", value: "#fff" }, stroke: null, stroke_width_mm: 0 } },
  ],
};

describe("alignment guides", () => {
  it("snaps a moving edge to a nearby visible element edge within tolerance", () => {
    const result = snapMoveToGuides(document, "moving", { dx_mm: 7, dy_mm: 0 }, 3);
    expect(result.delta).toEqual({ dx_mm: 10, dy_mm: 0 });
    expect(result.xGuide).toEqual({ position_mm: 100, target: "target left edge" });
  });

  it("snaps a resized edge while preserving the opposite anchor", () => {
    const result = snapResizeToGuides(document, "moving", "e", { dx_mm: 7, dy_mm: 0 }, 3);
    expect(result.delta).toEqual({ dx_mm: 10, dy_mm: 0 });
    expect(result.xGuide?.position_mm).toBe(100);
  });

  it.each([{ visible: false, locked: false }, { visible: true, locked: true }])("ignores a target that is hidden or locked", (state) => {
    const unavailable = { ...document, elements: document.elements.map((element) => element.id === "target" ? { ...element, ...state } : element) };
    const result = snapMoveToGuides(unavailable, "moving", { dx_mm: 7, dy_mm: 0 }, 3);
    expect(result.delta).toEqual({ dx_mm: 7, dy_mm: 0 });
    expect(result.xGuide).toBeUndefined();
  });

  it("does not align an element to its own edges", () => {
    const widePage = { ...document, page: { ...document.page, width_mm: 500 } };
    const result = snapMoveToGuides(widePage, "target", { dx_mm: 7, dy_mm: 0 }, 3);
    expect(result.delta).toEqual({ dx_mm: 7, dy_mm: 0 });
    expect(result.xGuide).toBeUndefined();
  });

  it("leaves deltas unchanged when every guide is outside the screen-space tolerance", () => {
    const result = snapMoveToGuides(document, "moving", { dx_mm: 3, dy_mm: 0 }, 2.9);
    expect(result.delta).toEqual({ dx_mm: 3, dy_mm: 0 });
  });
});
