import { describe, expect, it } from "vitest";

import type { TemplateDocument } from "../../domain/template-document";
import { renderTemplateSvg } from "../svg-renderer";

const document: TemplateDocument = {
  schema_version: 1,
  page: { width_mm: 90, height_mm: 40, orientation: "landscape" },
  print_rules: { copies_per_page: 1, margins_mm: { top: 0, right: 0, bottom: 0, left: 0 }, gap_mm: 0, slots: { rows: 1, columns: 1 } },
  repetition: { kind: "none" }, defaults: {},
  elements: [
    { id: "second", type: "rectangle", x_mm: 30, y_mm: 5, width_mm: 20, height_mm: 10, rotation_degrees: 0, z_index: 2, visible: true, locked: false, style: { fill: { kind: "literal", value: "#ffcc00" }, stroke: null, stroke_width_mm: 0 } },
    { id: "bound", type: "text", x_mm: 5, y_mm: 5, width_mm: 20, height_mm: 8, rotation_degrees: 0, z_index: 1, visible: true, locked: false, content: { kind: "binding", path: "visual.name" }, style: { font_family: "Arial", font_size_pt: 12, font_weight: 400, font_style: "normal", horizontal_align: "center", vertical_align: "middle", line_height: 1.2, wrapping: "nowrap", overflow: "clip", fit_policy: "none", color: { kind: "binding", path: "visual.accent_color" } } },
    { id: "first", type: "line", x_mm: 0, y_mm: 30, width_mm: 90, height_mm: 0, rotation_degrees: 0, z_index: 0, visible: true, locked: false, style: { stroke: { kind: "literal", value: "#111111" }, stroke_width_mm: 0.3 } },
  ],
};

describe("renderTemplateSvg", () => {
  it("renders deterministic, physically sized millimetre SVG from the canonical document", () => {
    const input = { document, values: { "visual.name": "A < B & C", "visual.accent_color": "#D40511" }, ariaLabel: "Aisle marker" };
    const first = renderTemplateSvg(input);
    expect(first).toEqual(renderTemplateSvg(input));
    expect(first.svg).toContain('width="90mm" height="40mm" viewBox="0 0 90 40"');
    expect(first.svg).toContain('<title id="wvm-svg-title">Aisle marker</title>');
    expect(first.svg.indexOf('id="first"')).toBeLessThan(first.svg.indexOf('id="bound"'));
    expect(first.svg).toContain("A &lt; B &amp; C");
    expect(first.svg).toContain('fill="#D40511"');
    expect(first.diagnostics).toEqual([]);
  });

  it("does not pass unsafe data-bound paint values into SVG attributes", () => {
    const output = renderTemplateSvg({ document, values: { "visual.name": "Marker", "visual.accent_color": "url(https://example.invalid/paint.svg#x)" }, ariaLabel: "Marker" });
    expect(output.svg).not.toContain("https://example.invalid");
    expect(output.svg).toContain('fill="#666666"');
    expect(output.diagnostics.join(" ")).toMatch(/invalid color/i);
  });

  it("uses an explicit placeholder and diagnostic for unavailable image assets", () => {
    const imageDocument: TemplateDocument = { ...document, elements: [{ id: "image", type: "image", x_mm: 1, y_mm: 2, width_mm: 10, height_mm: 8, rotation_degrees: 0, z_index: 0, visible: true, locked: false, fit: "contain", source: { kind: "binding", path: "brand.logo" } }] };
    const output = renderTemplateSvg({ document: imageDocument, values: {}, ariaLabel: "Image fixture" });
    expect(output.svg).toContain("Image preview unavailable");
    expect(output.diagnostics.join(" ")).toMatch(/missing or is not a supported local/i);
  });

  it("embeds validated local image data and preserves the requested fit mode", () => {
    const imageDocument: TemplateDocument = { ...document, elements: [{ id: "brand-image", type: "image", x_mm: 1, y_mm: 2, width_mm: 10, height_mm: 8, rotation_degrees: 0, z_index: 0, visible: true, locked: false, fit: "cover", source: { kind: "asset", asset_id: "asset-1" as never } }] };
    const output = renderTemplateSvg({ document: imageDocument, values: {}, ariaLabel: "Image fixture", assets: { "asset-1": "data:image/png;base64,aGVsbG8=" } });

    expect(output.svg).toContain('<image x="1" y="2" width="10" height="8" href="data:image/png;base64,aGVsbG8=" preserveAspectRatio="xMidYMid slice"/>');
    expect(output.diagnostics).toEqual([]);
  });
});
