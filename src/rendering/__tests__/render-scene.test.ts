import { describe, expect, it } from "vitest";

import type { TemplateDocument } from "../../domain/template-document";
import { buildTemplateRenderScene } from "../render-scene";

const document: TemplateDocument = {
  schema_version: 1,
  page: { width_mm: 90, height_mm: 40, orientation: "landscape" },
  print_rules: { copies_per_page: 1, margins_mm: { top: 0, right: 0, bottom: 0, left: 0 }, gap_mm: 0, slots: { rows: 1, columns: 1 } },
  repetition: { kind: "none" }, defaults: {},
  elements: [
    { id: "panel", type: "rectangle", x_mm: 30, y_mm: 5, width_mm: 20, height_mm: 10, rotation_degrees: 0, z_index: 2, visible: true, locked: false, style: { fill: { kind: "binding", path: "visual.accent_color" }, stroke: null, stroke_width_mm: 0 } },
    { id: "label", type: "text", x_mm: 5, y_mm: 5, width_mm: 20, height_mm: 8, rotation_degrees: 0, z_index: 1, visible: true, locked: false, content: { kind: "binding", path: "visual.name" }, style: { font_family: "Arial", font_size_pt: 12, font_weight: 400, font_style: "normal", horizontal_align: "center", vertical_align: "middle", line_height: 1.2, wrapping: "nowrap", overflow: "clip", fit_policy: "none", color: { kind: "binding", path: "brand.primary_color" } } },
    { id: "hidden", type: "rectangle", x_mm: 1, y_mm: 1, width_mm: 2, height_mm: 2, rotation_degrees: 0, z_index: 0, visible: false, locked: false, style: { fill: { kind: "literal", value: "#000000" }, stroke: null, stroke_width_mm: 0 } },
  ],
};

describe("buildTemplateRenderScene", () => {
  it("resolves bindings and physical text placement into a stable paint-ordered scene", () => {
    const scene = buildTemplateRenderScene({
      document,
      values: { "visual.name": "A-01", "visual.accent_color": "#D40511", "brand.primary_color": "#333333" },
      ariaLabel: "Aisle label",
    });

    expect(scene).toMatchObject({ page: { width_mm: 90, height_mm: 40 }, ariaLabel: "Aisle label", backgroundColor: "#fff" });
    expect(scene.elements.map(({ id }) => id)).toEqual(["label", "panel"]);
    expect(scene.elements[0]).toMatchObject({ kind: "text", id: "label", content: "A-01", fill: "#333333", text_x_mm: 15, text_anchor: "middle", font_size_mm: 12 * 25.4 / 72 });
    expect(scene.elements[1]).toMatchObject({ kind: "shape", id: "panel", fill: "#D40511", stroke: "none" });
    expect(scene.diagnostics).toEqual([]);
  });

  it("uses the same safe fallback and actionable diagnostics for invalid bound colors", () => {
    const scene = buildTemplateRenderScene({
      document,
      values: { "visual.name": "A-01", "visual.accent_color": "url(https://invalid.example/paint.svg#x)", "brand.primary_color": "red" },
      ariaLabel: "Aisle label",
    });

    expect(scene.elements[0]).toMatchObject({ kind: "text", fill: "#666666" });
    expect(scene.elements[1]).toMatchObject({ kind: "shape", fill: "#666666" });
    expect(scene.diagnostics).toHaveLength(2);
    expect(scene.diagnostics.join(" ")).toMatch(/label.*invalid color/i);
    expect(scene.diagnostics.join(" ")).toMatch(/panel.*invalid color/i);
  });

  it("shows an unresolved text binding explicitly instead of rendering a blank label", () => {
    const scene = buildTemplateRenderScene({ document, values: {}, ariaLabel: "Aisle label" });

    expect(scene.elements[0]).toMatchObject({ kind: "text", content: "[visual.name]" });
    expect(scene.diagnostics.join(" ")).toMatch(/label.*visual.name.*missing/i);
  });
});
