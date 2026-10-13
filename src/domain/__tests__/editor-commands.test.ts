import { describe, expect, it } from "vitest";

import { applyEditorCommand } from "../editor-commands";
import type { TemplateDocument } from "../template-document";

const document: TemplateDocument = {
  schema_version: 1,
  page: { width_mm: 210, height_mm: 297, orientation: "portrait" },
  print_rules: { copies_per_page: 1, margins_mm: { top: 5, right: 5, bottom: 5, left: 5 }, gap_mm: 0, slots: { rows: 1, columns: 1 } },
  repetition: { kind: "none" }, defaults: {},
  elements: [
    { id: "label", type: "text", x_mm: 10, y_mm: 10, width_mm: 80, height_mm: 15, rotation_degrees: 0, z_index: 0, visible: true, locked: false, content: { kind: "literal", value: "A-01" }, style: { font_family: "Arial", font_size_pt: 18, font_weight: 400, font_style: "normal", horizontal_align: "left", vertical_align: "middle", line_height: 1, wrapping: "nowrap", overflow: "clip", fit_policy: "none", color: { kind: "literal", value: "#111111" } } },
    { id: "panel", type: "rectangle", x_mm: 0, y_mm: 0, width_mm: 100, height_mm: 40, rotation_degrees: 0, z_index: 1, visible: true, locked: false, style: { fill: { kind: "literal", value: "#ffffff" }, stroke: null, stroke_width_mm: 0 } },
  ],
};

describe("editor style commands", () => {
  it("updates literal text content and appearance immutably", () => {
    const styled = applyEditorCommand(document, { type: "set_text_authoring", element_id: "label", content: { kind: "literal", value: "B-04" }, font_size_pt: 24, font_weight: "bold", font_style: "italic", horizontal_align: "center", vertical_align: "bottom", color: { kind: "literal", value: "#D40511" } });
    expect(styled.elements[0]).toMatchObject({ content: { kind: "literal", value: "B-04" }, style: { font_size_pt: 24, font_weight: "bold", font_style: "italic", horizontal_align: "center", vertical_align: "bottom", color: { kind: "literal", value: "#D40511" } } });
    expect(document.elements[0]).toMatchObject({ content: { kind: "literal", value: "A-01" }, style: { font_size_pt: 18, color: { kind: "literal", value: "#111111" } } });
  });

  it("can assign visual text and color bindings without converting them to literals", () => {
    const styled = applyEditorCommand(document, { type: "set_text_authoring", element_id: "label", content: { kind: "binding", path: "visual.location" }, font_size_pt: 18, font_weight: 400, color: { kind: "binding", path: "visual.accent_color" } });
    expect(styled.elements[0]).toMatchObject({ content: { kind: "binding", path: "visual.location" }, style: { color: { kind: "binding", path: "visual.accent_color" } } });
    const literal = applyEditorCommand(styled, { type: "set_text_authoring", element_id: "label", content: { kind: "literal", value: "A-02" }, font_size_pt: 18, font_weight: 400, color: { kind: "literal", value: "#000000" } });
    expect(literal.elements[0]).toMatchObject({ content: { kind: "literal", value: "A-02" }, style: { color: { kind: "literal", value: "#000000" } } });
  });

  it("updates literal shape fill without changing its stroke", () => {
    const updated = applyEditorCommand(document, { type: "set_shape_fill", element_id: "panel", color: { kind: "literal", value: "#ffcc00" } });
    expect(updated.elements[1]).toMatchObject({ style: { fill: { kind: "literal", value: "#ffcc00" }, stroke: null } });
    const bound = applyEditorCommand(updated, { type: "set_shape_fill", element_id: "panel", color: { kind: "binding", path: "visual.accent_color" } });
    expect(bound.elements[1]).toMatchObject({ style: { fill: { kind: "binding", path: "visual.accent_color" } } });
  });

  it("adds a new element above the existing paint order and rejects duplicate IDs", () => {
    const element = { ...document.elements[1]!, id: "new-panel", z_index: -20 };
    const updated = applyEditorCommand(document, { type: "add_element", element });
    expect(updated.elements).toHaveLength(3);
    expect(updated.elements[2]).toMatchObject({ id: "new-panel", z_index: 2 });
    expect(document.elements).toHaveLength(2);
    expect(() => applyEditorCommand(document, { type: "add_element", element: { ...element, id: "panel" } })).toThrow(/already exists/i);
  });

  it("removes an unlocked element and makes the command undoable from its prior document", () => {
    const updated = applyEditorCommand(document, { type: "remove_element", element_id: "label" });
    expect(updated.elements.map((item) => item.id)).toEqual(["panel"]);
    expect(document.elements.map((item) => item.id)).toEqual(["label", "panel"]);
    const locked = { ...document, elements: document.elements.map((item) => item.id === "label" ? { ...item, locked: true } : item) };
    expect(() => applyEditorCommand(locked, { type: "remove_element", element_id: "label" })).toThrow(/locked/i);
  });

  it("rejects invalid font sizes and colors", () => {
    expect(() => applyEditorCommand(document, { type: "set_text_authoring", element_id: "label", font_size_pt: 0, font_weight: "bold" })).toThrow(/font size/i);
    expect(() => applyEditorCommand(document, { type: "set_shape_fill", element_id: "panel", color: { kind: "literal", value: "red" } })).toThrow(/hexadecimal color/i);
    expect(() => applyEditorCommand(document, { type: "set_shape_fill", element_id: "panel", color: { kind: "binding", path: "visual.name" } as never })).toThrow(/binding path/i);
    expect(() => applyEditorCommand(document, { type: "set_text_authoring", element_id: "label", font_size_pt: 20, font_weight: "light" as never })).toThrow(/font weight/i);
    expect(() => applyEditorCommand(document, { type: "set_text_authoring", element_id: "label", font_size_pt: 20, font_weight: "normal", content: { kind: "literal", value: 123 } as never })).toThrow(/content must be a string/i);
    expect(() => applyEditorCommand(document, { type: "set_text_authoring", element_id: "label", font_size_pt: 20, font_weight: "normal", content: { kind: "binding", path: "visual.id" } as never })).toThrow(/binding path/i);
    expect(() => applyEditorCommand(document, { type: "set_text_authoring", element_id: "label", font_size_pt: 20, font_weight: "normal", horizontal_align: "justify" as never })).toThrow(/alignment/i);
  });

  it("rejects type mismatches, bindings, and locked targets", () => {
    expect(() => applyEditorCommand(document, { type: "set_text_authoring", element_id: "panel", font_size_pt: 20, font_weight: "normal" })).toThrow(/not text/i);
    const bound = { ...document, elements: document.elements.map((element) => element.id === "label" ? { ...element, content: { kind: "binding" as const, path: "visual.location" as const } } : element) };
    expect(applyEditorCommand(bound, { type: "set_text_authoring", element_id: "label", content: { kind: "binding", path: "visual.name" }, font_size_pt: 20, font_weight: "normal" }).elements[0]).toMatchObject({ content: { kind: "binding", path: "visual.name" } });
    const locked = { ...document, elements: document.elements.map((element) => element.id === "label" ? { ...element, locked: true } : element) };
    expect(() => applyEditorCommand(locked, { type: "set_text_authoring", element_id: "label", content: { kind: "literal", value: "x" }, font_size_pt: 20, font_weight: "normal" })).toThrow(/locked/i);
  });
});
