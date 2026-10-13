import type { Element, ElementGeometry, PageGeometry, TemplateDocument, TextStyle } from "./template-document";

export type ResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
export type ElementOrder = "front" | "back" | "forward" | "backward";

export type EditorCommand =
  | { readonly type: "move_element"; readonly element_id: string; readonly dx_mm: number; readonly dy_mm: number }
  | { readonly type: "resize_element"; readonly element_id: string; readonly handle: ResizeHandle; readonly dx_mm: number; readonly dy_mm: number; readonly minimum_mm?: number }
  | { readonly type: "set_element_geometry"; readonly element_id: string; readonly geometry: ElementGeometry }
  | { readonly type: "set_page_geometry"; readonly width_mm: number; readonly height_mm: number; readonly orientation: PageGeometry["orientation"] }
  | { readonly type: "reorder_element"; readonly element_id: string; readonly position: ElementOrder }
  | { readonly type: "set_element_visible"; readonly element_id: string; readonly visible: boolean }
  | { readonly type: "set_element_locked"; readonly element_id: string; readonly locked: boolean }
  | { readonly type: "set_text_authoring"; readonly element_id: string; readonly value?: string; readonly font_size_pt: number; readonly font_weight: TextStyle["font_weight"]; readonly font_style?: TextStyle["font_style"]; readonly horizontal_align?: TextStyle["horizontal_align"]; readonly vertical_align?: TextStyle["vertical_align"]; readonly color?: string }
  | { readonly type: "set_shape_fill"; readonly element_id: string; readonly color: string }
  | { readonly type: "add_element"; readonly element: Element }
  | { readonly type: "remove_element"; readonly element_id: string };

function finite(...values: number[]) {
  if (values.some((value) => !Number.isFinite(value))) throw new RangeError("Editor values must be finite.");
  if (values.some((value) => Math.abs(value) > Number.MAX_SAFE_INTEGER)) throw new RangeError("Editor values exceed the safe numeric range.");
}

function validHexColor(color: string): boolean {
  return /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(color);
}

function indexOfElement(elements: readonly Element[], id: string): number {
  const index = elements.findIndex((element) => element.id === id);
  if (index < 0) throw new Error(`Element not found: ${id}`);
  return index;
}

function updateElement(document: TemplateDocument, id: string, update: (element: Element) => Element, requireUnlocked = true): TemplateDocument {
  const index = indexOfElement(document.elements, id);
  const current = document.elements[index]!;
  if (requireUnlocked && current.locked) throw new Error(`Element ${id} is locked.`);
  const elements = [...document.elements];
  elements[index] = update(current);
  return { ...document, elements };
}

function validateGeometry(geometry: ElementGeometry) {
  finite(geometry.x_mm, geometry.y_mm, geometry.width_mm, geometry.height_mm, geometry.rotation_degrees);
  if (geometry.width_mm <= 0 || geometry.height_mm <= 0) throw new RangeError("Element dimensions must remain positive.");
}

function move(document: TemplateDocument, id: string, dx: number, dy: number): TemplateDocument {
  finite(dx, dy);
  return updateElement(document, id, (element) => {
    const x_mm = element.x_mm + dx;
    const y_mm = element.y_mm + dy;
    finite(x_mm, y_mm);
    return { ...element, x_mm, y_mm };
  });
}

function resize(document: TemplateDocument, command: Extract<EditorCommand, { type: "resize_element" }>): TemplateDocument {
  finite(command.dx_mm, command.dy_mm);
  const min = command.minimum_mm ?? 1;
  finite(min);
  if (min <= 0) throw new RangeError("Minimum element dimension must be positive.");
  return updateElement(document, command.element_id, (element) => {
    let { x_mm: x, y_mm: y, width_mm: width, height_mm: height } = element;
    const angle = element.rotation_degrees * Math.PI / 180;
    const localDx = command.dx_mm * Math.cos(angle) + command.dy_mm * Math.sin(angle);
    const localDy = -command.dx_mm * Math.sin(angle) + command.dy_mm * Math.cos(angle);
    const west = command.handle.includes("w");
    const east = command.handle.includes("e");
    const north = command.handle.includes("n");
    const south = command.handle.includes("s");
    if (west) { x += localDx; width -= localDx; }
    if (east) width += localDx;
    if (north) { y += localDy; height -= localDy; }
    if (south) height += localDy;
    if (width < min || height < min) throw new RangeError(`Element dimensions cannot be below the ${min} mm minimum.`);
    validateGeometry({ x_mm: x, y_mm: y, width_mm: width, height_mm: height, rotation_degrees: element.rotation_degrees });
    return { ...element, x_mm: x, y_mm: y, width_mm: width, height_mm: height };
  });
}

function reorder(document: TemplateDocument, id: string, position: ElementOrder): TemplateDocument {
  const sorted = [...document.elements].sort((a, b) => a.z_index - b.z_index || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const index = indexOfElement(sorted, id);
  const [element] = sorted.splice(index, 1);
  if (!element) throw new Error(`Element not found: ${id}`);
  if (position === "front") sorted.push(element);
  else if (position === "back") sorted.unshift(element);
  else if (position === "forward") sorted.splice(Math.min(index + 1, sorted.length), 0, element);
  else sorted.splice(Math.max(index - 1, 0), 0, element);
  const zIndexes = new Map(sorted.map((item, zIndex) => [item.id, zIndex]));
  return { ...document, elements: document.elements.map((item) => ({ ...item, z_index: zIndexes.get(item.id)! })) };
}

export function applyEditorCommand(document: TemplateDocument, command: EditorCommand): TemplateDocument {
  switch (command.type) {
    case "move_element": return move(document, command.element_id, command.dx_mm, command.dy_mm);
    case "resize_element": return resize(document, command);
    case "set_element_geometry":
      validateGeometry(command.geometry);
      return updateElement(document, command.element_id, (element) => ({ ...element, ...command.geometry }));
    case "set_page_geometry":
      finite(command.width_mm, command.height_mm);
      if (command.width_mm <= 0 || command.height_mm <= 0) throw new RangeError("Page dimensions must remain positive.");
      return { ...document, page: { width_mm: command.width_mm, height_mm: command.height_mm, orientation: command.orientation } };
    case "reorder_element":
      return reorder(document, command.element_id, command.position);
    case "set_element_visible":
      return updateElement(document, command.element_id, (element) => ({ ...element, visible: command.visible }), false);
    case "set_element_locked":
      return updateElement(document, command.element_id, (element) => ({ ...element, locked: command.locked }), false);
    case "set_text_authoring":
      finite(command.font_size_pt, ...(typeof command.font_weight === "number" ? [command.font_weight] : []));
      if (command.font_size_pt <= 0) throw new RangeError("Text font size must be positive.");
      if (command.font_style !== undefined && command.font_style !== "normal" && command.font_style !== "italic") throw new RangeError("Text font style must be normal or italic.");
      if (command.horizontal_align !== undefined && !["left", "center", "right"].includes(command.horizontal_align)) throw new RangeError("Text alignment must be left, center, or right.");
      if (command.vertical_align !== undefined && !["top", "middle", "bottom"].includes(command.vertical_align)) throw new RangeError("Text vertical alignment must be top, middle, or bottom.");
      if (command.value !== undefined && typeof command.value !== "string") throw new TypeError("Text content must be a string.");
      if (typeof command.font_weight === "string" && command.font_weight !== "normal" && command.font_weight !== "bold") throw new RangeError("Text font weight must be normal, bold, or a numeric weight.");
      if (typeof command.font_weight === "number" && (command.font_weight < 100 || command.font_weight > 900 || command.font_weight % 100 !== 0)) throw new RangeError("Text weight must be between 100 and 900 in 100-point steps.");
      if (command.color !== undefined && !validHexColor(command.color)) throw new RangeError("Text color must use a hexadecimal color value.");
      return updateElement(document, command.element_id, (element) => {
        if (element.type !== "text") throw new Error(`Element ${element.id} is not text.`);
        if (command.value !== undefined && element.content.kind !== "literal") throw new Error(`Element ${element.id} does not have literal text content.`);
        return { ...element,
          ...(command.value !== undefined ? { content: { kind: "literal" as const, value: command.value } } : {}),
          style: { ...element.style, font_size_pt: command.font_size_pt, font_weight: command.font_weight,
            ...(command.font_style !== undefined ? { font_style: command.font_style } : {}),
            ...(command.horizontal_align !== undefined ? { horizontal_align: command.horizontal_align } : {}),
            ...(command.vertical_align !== undefined ? { vertical_align: command.vertical_align } : {}),
            ...(command.color !== undefined ? { color: { kind: "literal" as const, value: command.color } } : {}) },
        };
      });
    case "set_shape_fill":
      if (!validHexColor(command.color)) throw new RangeError("Shape fill must use a hexadecimal color value.");
      return updateElement(document, command.element_id, (element) => {
        if (element.type !== "rectangle" && element.type !== "band" && element.type !== "background") throw new Error(`Element ${element.id} does not support a shape fill.`);
        return { ...element, style: { ...element.style, fill: { kind: "literal", value: command.color } } };
      });
    case "add_element": {
      if (!command.element.id.trim()) throw new Error("Element ID cannot be empty.");
      if (document.elements.some((element) => element.id === command.element.id)) throw new Error(`Element ID already exists: ${command.element.id}`);
      validateGeometry(command.element);
      const z_index = document.elements.reduce((highest, element) => Math.max(highest, element.z_index), -1) + 1;
      finite(z_index);
      return { ...document, elements: [...document.elements, { ...command.element, z_index }] };
    }
    case "remove_element": {
      const element = document.elements[indexOfElement(document.elements, command.element_id)]!;
      if (element.locked) throw new Error(`Element ${command.element_id} is locked.`);
      return { ...document, elements: document.elements.filter((item) => item.id !== command.element_id) };
    }
  }
}
