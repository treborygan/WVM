import type { Element, TemplateDocument } from "../domain/template-document";

export type RenderValue = string | number | boolean | null;

export interface RenderSceneInput {
  readonly document: TemplateDocument;
  readonly values: Readonly<Record<string, RenderValue>>;
  readonly ariaLabel: string;
}

interface RenderSceneElementBase {
  readonly id: string;
  readonly source: Element;
  readonly x_mm: number;
  readonly y_mm: number;
  readonly width_mm: number;
  readonly height_mm: number;
  readonly rotation_degrees: number;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly z_index: number;
  readonly accessible_label: string;
  readonly transform: string | null;
}

export interface RenderSceneTextElement extends RenderSceneElementBase {
  readonly kind: "text";
  readonly content: string;
  readonly fill: string;
  readonly font_family: string;
  readonly font_size_mm: number;
  readonly font_weight: number | "normal" | "bold";
  readonly font_style: "normal" | "italic";
  readonly text_anchor: "start" | "middle" | "end";
  readonly text_x_mm: number;
  readonly text_y_mm: number;
  readonly clip_path_id: string;
}

export interface RenderSceneShapeElement extends RenderSceneElementBase {
  readonly kind: "shape";
  readonly fill: string;
  readonly stroke: string;
  readonly stroke_width_mm: number;
}

export interface RenderSceneLineElement extends RenderSceneElementBase {
  readonly kind: "line";
  readonly stroke: string;
  readonly stroke_width_mm: number;
}

export interface RenderSceneImageElement extends RenderSceneElementBase {
  readonly kind: "image";
  readonly source_label: string;
}

export type RenderSceneElement = RenderSceneTextElement | RenderSceneShapeElement | RenderSceneLineElement | RenderSceneImageElement;

export interface RenderScene {
  readonly page: TemplateDocument["page"];
  readonly ariaLabel: string;
  readonly backgroundColor: "#fff";
  readonly elements: readonly RenderSceneElement[];
  readonly diagnostics: readonly string[];
}

const safeColorPattern = /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;

function resolveText(element: Extract<Element, { type: "text" }>, values: RenderSceneInput["values"], diagnostics: string[]): string {
  if (element.content.kind === "literal") return element.content.value;
  const value = values[element.content.path];
  if (value === null || value === undefined) {
    diagnostics.push(`Text “${element.id}” is missing ${element.content.path}; preview shows the binding path.`);
    return `[${element.content.path}]`;
  }
  return String(value);
}

function resolveColor(
  binding: { readonly kind: "literal"; readonly value: string } | { readonly kind: "binding"; readonly path: string },
  values: RenderSceneInput["values"],
  diagnostics: string[],
  elementId: string,
): string {
  const value = binding.kind === "literal" ? binding.value : values[binding.path];
  if (typeof value === "string" && safeColorPattern.test(value)) return value;
  diagnostics.push(`Element “${elementId}” has a missing or invalid color value; preview uses #666666.`);
  return "#666666";
}

function rotationTransform(element: Element): string | null {
  if (element.rotation_degrees === 0) return null;
  const centerX = element.x_mm + element.width_mm / 2;
  const centerY = element.y_mm + element.height_mm / 2;
  return `rotate(${element.rotation_degrees} ${centerX} ${centerY})`;
}

function base(element: Element, accessibleLabel: string): RenderSceneElementBase {
  return {
    id: element.id,
    source: element,
    x_mm: element.x_mm,
    y_mm: element.y_mm,
    width_mm: element.width_mm,
    height_mm: element.height_mm,
    rotation_degrees: element.rotation_degrees,
    visible: element.visible,
    locked: element.locked,
    z_index: element.z_index,
    accessible_label: accessibleLabel,
    transform: rotationTransform(element),
  };
}

export function buildTemplateRenderScene(input: RenderSceneInput): RenderScene {
  const diagnostics: string[] = [];
  const elements: RenderSceneElement[] = [];
  const ordered = [...input.document.elements].sort((a, b) => a.z_index - b.z_index || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const element of ordered) {
    if (!element.visible) continue;

    if (element.type === "text") {
      if (element.style.wrapping === "wrap") diagnostics.push(`Text “${element.id}” uses wrapping; line layout is simplified in this preview.`);
      if (element.style.fit_policy !== "none") diagnostics.push(`Text “${element.id}” uses fit-to-box; font fitting is simplified in this preview.`);
      if (element.style.overflow === "ellipsis") diagnostics.push(`Text “${element.id}” requests ellipsis; truncation is simplified to clipping in this preview.`);
      const content = resolveText(element, input.values, diagnostics);
      const anchor = element.style.horizontal_align === "center" ? "middle" : element.style.horizontal_align === "right" ? "end" : "start";
      const textX = element.style.horizontal_align === "center" ? element.x_mm + element.width_mm / 2 : element.style.horizontal_align === "right" ? element.x_mm + element.width_mm : element.x_mm;
      const textY = element.style.vertical_align === "top" ? element.y_mm + element.style.font_size_pt * 25.4 / 72 : element.style.vertical_align === "bottom" ? element.y_mm + element.height_mm : element.y_mm + element.height_mm / 2;
      elements.push({
        ...base(element, `Select text: ${content}`),
        kind: "text",
        content,
        fill: resolveColor(element.style.color, input.values, diagnostics, element.id),
        font_family: element.style.font_family,
        font_size_mm: element.style.font_size_pt * 25.4 / 72,
        font_weight: element.style.font_weight,
        font_style: element.style.font_style,
        text_anchor: anchor,
        text_x_mm: textX,
        text_y_mm: textY,
        clip_path_id: `wvm-text-clip-${elements.length}`,
      });
      continue;
    }

    if (element.type === "rectangle" || element.type === "band" || element.type === "background") {
      elements.push({
        ...base(element, `Select ${element.type}: ${element.id}`),
        kind: "shape",
        fill: resolveColor(element.style.fill, input.values, diagnostics, element.id),
        stroke: element.style.stroke ? resolveColor(element.style.stroke, input.values, diagnostics, element.id) : "none",
        stroke_width_mm: element.style.stroke_width_mm,
      });
      continue;
    }

    if (element.type === "line" || element.type === "border") {
      elements.push({
        ...base(element, `Select ${element.type}: ${element.id}`),
        kind: "line",
        stroke: resolveColor(element.style.stroke, input.values, diagnostics, element.id),
        stroke_width_mm: element.style.stroke_width_mm,
      });
      continue;
    }

    if (element.type === "image") {
      const sourceLabel = element.source.kind === "asset" ? element.source.asset_id : element.source.path;
      diagnostics.push(`Image “${element.id}” is not available to the SVG preview.`);
      elements.push({ ...base(element, `Select image: ${sourceLabel}`), kind: "image", source_label: sourceLabel });
    }
  }

  return {
    page: input.document.page,
    ariaLabel: input.ariaLabel,
    backgroundColor: "#fff",
    elements,
    diagnostics,
  };
}
