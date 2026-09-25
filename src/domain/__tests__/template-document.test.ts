import { describe, expect, it } from "vitest";

import { validateTemplateDocument } from "../validation";

const validDocument = {
  schema_version: 1,
  page: { width_mm: 210, height_mm: 297, orientation: "portrait" },
  print_rules: {
    copies_per_page: 2,
    margins_mm: { top: 5, right: 5, bottom: 5, left: 5 },
    gap_mm: 3,
    slots: { rows: 2, columns: 1 },
  },
  repetition: { kind: "none" },
  defaults: { font_family: "Arial", text_color: "#111111" },
  elements: [
    {
      id: "title",
      type: "text",
      x_mm: 10,
      y_mm: 10,
      width_mm: 100,
      height_mm: 20,
      rotation_degrees: 0,
      z_index: 1,
      visible: true,
      locked: false,
      content: { kind: "binding", path: "visual.location" },
      style: {
        font_family: "Arial",
        font_size_pt: 18,
        font_weight: 700,
        font_style: "normal",
        horizontal_align: "left",
        vertical_align: "middle",
        line_height: 1.2,
        wrapping: "wrap",
        overflow: "clip",
        fit_policy: "shrink_to_fit",
        color: { kind: "literal", value: "#111111" },
      },
    },
  ],
};

describe("TemplateDocument validation", () => {
  it("accepts a schema-versioned millimetre document with typed bindings", () => {
    const result = validateTemplateDocument(validDocument);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.document.schema_version).toBe(1);
      expect(result.document.page.width_mm).toBe(210);
      expect(result.document.elements[0]?.type).toBe("text");
      expect(result.document.elements[0]?.x_mm).toBe(10);
    }
  });

  it("allows off-page element positions to remain editable", () => {
    const result = validateTemplateDocument({
      ...validDocument,
      elements: [{ ...validDocument.elements[0], x_mm: -10, y_mm: -2 }],
    });

    expect(result.valid).toBe(true);
  });

  it.each([
    [2, 2, 1],
    [3, 3, 1],
    [12, 3, 4],
  ])("accepts %s copies across %s rows and %s columns", (copies, rows, columns) => {
    const result = validateTemplateDocument({
      ...validDocument,
      print_rules: {
        ...validDocument.print_rules,
        copies_per_page: copies,
        slots: { rows, columns },
      },
    });

    expect(result.valid).toBe(true);
  });

  it("accepts text, shape, line, and image elements with their typed content", () => {
    const result = validateTemplateDocument({
      ...validDocument,
      elements: [
        ...validDocument.elements,
        {
          id: "background",
          type: "rectangle",
          x_mm: 0,
          y_mm: 0,
          width_mm: 200,
          height_mm: 287,
          rotation_degrees: 0,
          z_index: 0,
          visible: true,
          locked: true,
          style: {
            fill: { kind: "literal", value: "#ffffff" },
            stroke: null,
            stroke_width_mm: 0.2,
          },
        },
        {
          id: "divider",
          type: "line",
          x_mm: 1,
          y_mm: 2,
          width_mm: 180,
          height_mm: 0.1,
          rotation_degrees: 0,
          z_index: 2,
          visible: true,
          locked: false,
          style: {
            stroke: { kind: "binding", path: "brand.primary_color" },
            stroke_width_mm: 0.5,
          },
        },
        {
          id: "logo",
          type: "image",
          x_mm: 150,
          y_mm: 10,
          width_mm: 30,
          height_mm: 15,
          rotation_degrees: 0,
          z_index: 3,
          visible: true,
          locked: false,
          source: { kind: "binding", path: "brand.logo" },
          fit: "contain",
        },
      ],
    });

    expect(result.valid).toBe(true);
  });

  it("rejects unsupported schema versions with a path-specific diagnostic", () => {
    const result = validateTemplateDocument({ ...validDocument, schema_version: 99 });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          code: "unsupported_schema_version",
          path: "schema_version",
        }),
      );
    }
  });

  it("rejects duplicate element IDs", () => {
    const result = validateTemplateDocument({
      ...validDocument,
      elements: [validDocument.elements[0], { ...validDocument.elements[0], id: "title" }],
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({ code: "duplicate_element_id", path: "elements[1].id" }),
      );
    }
  });

  it.each([
    [0, 20, "positive_geometry_required"],
    [-1, 20, "positive_geometry_required"],
    [Number.NaN, 20, "finite_geometry_required"],
    [Number.MAX_VALUE, 20, "geometry_out_of_range"],
  ])("rejects width %s and height %s with a structured geometry diagnostic", (width, height, code) => {
    const element = { ...validDocument.elements[0], width_mm: width, height_mm: height };
    const result = validateTemplateDocument({ ...validDocument, elements: [element] });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({ code, path: "elements[0].width_mm" }),
      );
    }
  });

  it.each([
    ["text", { kind: "binding", path: "brand.logo" }],
    ["image", undefined],
  ])("rejects a missing or incompatible %s content binding", (elementType, content) => {
    const sourceElement = validDocument.elements[0];
    const element =
      elementType === "image"
        ? { ...sourceElement, type: "image", source: content }
        : { ...sourceElement, content };
    const result = validateTemplateDocument({ ...validDocument, elements: [element] });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.diagnostics.some((diagnostic) => diagnostic.code === "binding_required")).toBe(true);
    }
  });

  it("rejects an invalid copy count or slot geometry", () => {
    const result = validateTemplateDocument({
      ...validDocument,
      print_rules: { ...validDocument.print_rules, copies_per_page: 3 },
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({ code: "print_slot_count_mismatch", path: "print_rules" }),
      );
    }
  });

  it("rejects malformed IDs on fixed image assets", () => {
    const result = validateTemplateDocument({
      ...validDocument,
      elements: [
        {
          ...validDocument.elements[0],
          id: "logo",
          type: "image",
          source: { kind: "asset", asset_id: " bad asset id" },
          fit: "contain",
        },
      ],
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({ code: "asset_id_invalid", path: "elements[0].source.asset_id" }),
      );
    }
  });
});
