import { describe, expect, it } from "vitest";

import type { TemplateDocument } from "../template-document";
import { applyEditorCommand, type EditorCommand } from "../editor-commands";
import { EditorHistory } from "../editor-history";

const document: TemplateDocument = {
  schema_version: 1,
  page: { width_mm: 210, height_mm: 297, orientation: "portrait" },
  print_rules: { copies_per_page: 2, margins_mm: { top: 5, right: 5, bottom: 5, left: 5 }, gap_mm: 3, slots: { rows: 2, columns: 1 } },
  repetition: { kind: "none" }, defaults: {},
  elements: [
    { id: "a", type: "rectangle", x_mm: 10, y_mm: 20, width_mm: 40, height_mm: 30, rotation_degrees: 0, z_index: 1, visible: true, locked: false, style: { fill: { kind: "literal", value: "#fff" }, stroke: null, stroke_width_mm: 0 } },
    { id: "b", type: "rectangle", x_mm: 60, y_mm: 20, width_mm: 20, height_mm: 20, rotation_degrees: 0, z_index: 2, visible: true, locked: false, style: { fill: { kind: "literal", value: "#000" }, stroke: null, stroke_width_mm: 0 } },
  ],
};

describe("immutable editor commands", () => {
  it("moves an element without mutating the prior document", () => {
    const result = applyEditorCommand(document, { type: "move_element", element_id: "a", dx_mm: 8, dy_mm: -3 });
    expect(result.elements[0]).toMatchObject({ x_mm: 18, y_mm: 17 });
    expect(document.elements[0]).toMatchObject({ x_mm: 10, y_mm: 20 });
  });

  it("resizes from the west while preserving the opposite east anchor", () => {
    const result = applyEditorCommand(document, { type: "resize_element", element_id: "a", handle: "w", dx_mm: 5, dy_mm: 0, minimum_mm: 1 });
    expect(result.elements[0]).toMatchObject({ x_mm: 15, width_mm: 35 });
    expect(result.elements[0]!.x_mm + result.elements[0]!.width_mm).toBe(50);
  });

  it("converts screen-axis drag deltas to the element's local axes before resizing a rotated element", () => {
    const rotated = applyEditorCommand(document, { type: "set_element_geometry", element_id: "a", geometry: { x_mm: 10, y_mm: 20, width_mm: 40, height_mm: 30, rotation_degrees: 90 } });
    const result = applyEditorCommand(rotated, { type: "resize_element", element_id: "a", handle: "e", dx_mm: 0, dy_mm: 5, minimum_mm: 1 });
    expect(result.elements[0]).toMatchObject({ width_mm: 45, height_mm: 30, x_mm: 10, y_mm: 20 });
  });

  it("rejects non-positive dimensions and geometry edits to locked elements", () => {
    expect(() => applyEditorCommand(document, { type: "resize_element", element_id: "a", handle: "e", dx_mm: -50, dy_mm: 0, minimum_mm: 1 })).toThrow(/minimum/);
    const locked = applyEditorCommand(document, { type: "set_element_locked", element_id: "a", locked: true });
    expect(() => applyEditorCommand(locked, { type: "move_element", element_id: "a", dx_mm: 1, dy_mm: 1 })).toThrow(/locked/);
  });

  it("supports accessible visibility and deterministic z-order commands", () => {
    const hidden = applyEditorCommand(document, { type: "set_element_visible", element_id: "a", visible: false });
    expect(hidden.elements.find(({ id }) => id === "a")?.visible).toBe(false);
    const front = applyEditorCommand(document, { type: "reorder_element", element_id: "a", position: "front" });
    expect([...front.elements].sort((a, b) => a.z_index - b.z_index).map(({ id }) => id)).toEqual(["b", "a"]);
  });

  it("rejects non-finite and out-of-range values without changing the original document", () => {
    expect(() => applyEditorCommand(document, { type: "move_element", element_id: "a", dx_mm: Infinity, dy_mm: 0 })).toThrow(/finite/);
    expect(() => applyEditorCommand(document, { type: "move_element", element_id: "a", dx_mm: Number.MAX_VALUE, dy_mm: 0 })).toThrow(/safe numeric range/);
    expect(document.elements[0]).toMatchObject({ x_mm: 10, y_mm: 20 });
  });
});

describe("EditorHistory", () => {
  it("groups each command as one reversible edit and clears the redo branch on a new edit", () => {
    const history = new EditorHistory(document);
    const move: EditorCommand = { type: "move_element", element_id: "a", dx_mm: 2, dy_mm: 3 };
    history.apply(move);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
    expect(history.undo()?.elements[0]).toMatchObject({ x_mm: 10, y_mm: 20 });
    expect(history.canRedo).toBe(true);
    history.redo();
    expect(history.current.elements[0]).toMatchObject({ x_mm: 12, y_mm: 23 });
    history.undo();
    history.apply({ type: "set_element_visible", element_id: "b", visible: false });
    expect(history.canRedo).toBe(false);
    expect(history.current.elements.find(({ id }) => id === "b")?.visible).toBe(false);
  });

  it("returns no document at the ends of undo and redo history", () => {
    const history = new EditorHistory(document);
    expect(history.undo()).toBeNull();
    history.apply({ type: "set_page_geometry", width_mm: 297, height_mm: 210, orientation: "landscape" });
    expect(history.redo()).toBeNull();
  });
});
