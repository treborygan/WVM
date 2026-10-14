import { describe, expect, it, vi } from "vitest";

import type { TemplateDocument } from "../../domain/template-document";
import { exportTemplateDocumentAsSvg, suggestedSvgFileName } from "../export-template-svg";

const document: TemplateDocument = {
  schema_version: 1,
  page: { width_mm: 100, height_mm: 60, orientation: "landscape" },
  print_rules: { copies_per_page: 1, margins_mm: { top: 0, right: 0, bottom: 0, left: 0 }, gap_mm: 0, slots: { rows: 1, columns: 1 } },
  repetition: { kind: "none" }, defaults: {},
  elements: [{ id: "caption", type: "text", x_mm: 3, y_mm: 4, width_mm: 50, height_mm: 10, rotation_degrees: 0, z_index: 0, visible: true, locked: false, content: { kind: "literal", value: "Aisle A-01" }, style: { font_family: "Arial", font_size_pt: 12, font_weight: 400, font_style: "normal", horizontal_align: "left", vertical_align: "middle", line_height: 1, wrapping: "nowrap", overflow: "clip", fit_policy: "none", color: { kind: "literal", value: "#111111" } } }],
};

describe("SVG export", () => {
  it("suggests a Windows-safe filename", () => {
    expect(suggestedSvgFileName("Aisle: North / A-01. ")).toBe("Aisle_ North _ A-01.svg");
    expect(suggestedSvgFileName("... ")).toBe("warehouse-visual.svg");
    expect(suggestedSvgFileName("CON")).toBe("_CON.svg");
  });

  it("writes the deterministic mm SVG only after the operator chooses a path", async () => {
    const files = { chooseDestination: vi.fn().mockResolvedValue("C:\\Exports\\Aisle.svg"), writeText: vi.fn().mockResolvedValue(undefined) };
    const result = await exportTemplateDocumentAsSvg({ document, values: {}, visualName: "Aisle: North" }, files);
    expect(files.chooseDestination).toHaveBeenCalledWith("Aisle_ North.svg");
    expect(files.writeText).toHaveBeenCalledWith("C:\\Exports\\Aisle.svg", expect.stringContaining('width="100mm" height="60mm"'));
    expect(result).toEqual({ status: "saved", path: "C:\\Exports\\Aisle.svg", diagnostics: [] });
  });

  it("does not write when the operator cancels the file dialog", async () => {
    const files = { chooseDestination: vi.fn().mockResolvedValue(null), writeText: vi.fn() };
    const result = await exportTemplateDocumentAsSvg({ document, values: {}, visualName: "Aisle" }, files);
    expect(result).toEqual({ status: "cancelled" });
    expect(files.writeText).not.toHaveBeenCalled();
  });

  it("refuses a malformed document before showing the file dialog", async () => {
    const files = { chooseDestination: vi.fn(), writeText: vi.fn() };
    const invalid = { ...document, page: { ...document.page, width_mm: -1 } } as TemplateDocument;
    const result = await exportTemplateDocumentAsSvg({ document: invalid, values: {}, visualName: "Aisle" }, files);
    expect(result.status).toBe("invalid");
    expect(files.chooseDestination).not.toHaveBeenCalled();
    expect(files.writeText).not.toHaveBeenCalled();
  });
});
