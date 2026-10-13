import type { Element, TemplateDocument } from "../domain/template-document";

export interface SvgRenderResult {
  readonly svg: string;
  readonly diagnostics: readonly string[];
}

export interface SvgRenderInput {
  readonly document: TemplateDocument;
  readonly values: Readonly<Record<string, string | number | boolean | null>>;
  readonly ariaLabel: string;
}

const xml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
}[character] ?? character));

const isSafeColor = (value: string): boolean => /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value);

function resolveText(binding: { readonly kind: "literal"; readonly value: string } | { readonly kind: "binding"; readonly path: string }, values: SvgRenderInput["values"]): string {
  if (binding.kind === "literal") return binding.value;
  const value = values[binding.path];
  return value === null || value === undefined ? "" : String(value);
}

function resolveColor(binding: { readonly kind: "literal"; readonly value: string } | { readonly kind: "binding"; readonly path: string }, values: SvgRenderInput["values"], diagnostics: string[], elementId: string): string {
  const value = binding.kind === "literal" ? binding.value : values[binding.path];
  if (typeof value === "string" && isSafeColor(value)) return value;
  diagnostics.push(`Element “${elementId}” has a missing or invalid color value; preview uses #666666.`);
  return "#666666";
}

function transform(element: Element): string {
  if (!element.rotation_degrees) return "";
  const centerX = element.x_mm + element.width_mm / 2;
  const centerY = element.y_mm + element.height_mm / 2;
  return ` transform="rotate(${element.rotation_degrees} ${centerX} ${centerY})"`;
}

function renderElement(element: Element, values: SvgRenderInput["values"], diagnostics: string[]): string {
  if (!element.visible) return "";
  const group = (body: string) => `<g id="${xml(element.id)}"${transform(element)}>${body}</g>`;
  if (element.type === "text") {
    if (element.style.wrapping === "wrap") diagnostics.push(`Text “${element.id}” uses wrapping; line layout is simplified in this preview.`);
    if (element.style.fit_policy !== "none") diagnostics.push(`Text “${element.id}” uses fit-to-box; font fitting is simplified in this preview.`);
    if (element.style.overflow === "ellipsis") diagnostics.push(`Text “${element.id}” requests ellipsis; truncation is simplified to clipping in this preview.`);
    const text = resolveText(element.content, values);
    const color = resolveColor(element.style.color, values, diagnostics, element.id);
    const anchor = element.style.horizontal_align === "center" ? "middle" : element.style.horizontal_align === "right" ? "end" : "start";
    const x = element.style.horizontal_align === "center" ? element.x_mm + element.width_mm / 2 : element.style.horizontal_align === "right" ? element.x_mm + element.width_mm : element.x_mm;
    const y = element.style.vertical_align === "top" ? element.y_mm + element.style.font_size_pt * 25.4 / 72 : element.style.vertical_align === "bottom" ? element.y_mm + element.height_mm : element.y_mm + element.height_mm / 2;
    const weight = element.style.font_weight === "normal" ? 400 : element.style.font_weight === "bold" ? 700 : element.style.font_weight;
    const clipId = `clip-${element.id}`;
    const svgText = `<text x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="middle" font-family="${xml(element.style.font_family)}" font-size="${element.style.font_size_pt * 25.4 / 72}" font-weight="${weight}" font-style="${element.style.font_style}" fill="${xml(color)}">${xml(text)}</text>`;
    return `<defs><clipPath id="${xml(clipId)}"><rect x="${element.x_mm}" y="${element.y_mm}" width="${element.width_mm}" height="${element.height_mm}"/></clipPath></defs><g clip-path="url(#${xml(clipId)})">${group(svgText)}</g>`;
  }
  if (element.type === "rectangle" || element.type === "band" || element.type === "background") {
    const fill = resolveColor(element.style.fill, values, diagnostics, element.id);
    const stroke = element.style.stroke ? resolveColor(element.style.stroke, values, diagnostics, element.id) : "none";
    return group(`<rect x="${element.x_mm}" y="${element.y_mm}" width="${element.width_mm}" height="${element.height_mm}" fill="${xml(fill)}" stroke="${xml(stroke)}" stroke-width="${element.style.stroke_width_mm}"/>`);
  }
  if (element.type === "line" || element.type === "border") {
    const stroke = resolveColor(element.style.stroke, values, diagnostics, element.id);
    return group(`<line x1="${element.x_mm}" y1="${element.y_mm}" x2="${element.x_mm + element.width_mm}" y2="${element.y_mm + element.height_mm}" stroke="${xml(stroke)}" stroke-width="${element.style.stroke_width_mm}"/>`);
  }
  diagnostics.push(`Image “${element.id}” is not available to the SVG preview.`);
  return group(`<rect x="${element.x_mm}" y="${element.y_mm}" width="${element.width_mm}" height="${element.height_mm}" fill="#f1f2f3" stroke="#777" stroke-dasharray="2 1"/><text x="${element.x_mm + element.width_mm / 2}" y="${element.y_mm + element.height_mm / 2}" text-anchor="middle" dominant-baseline="middle" font-size="3" fill="#555">Image preview unavailable</text>`);
}

export function renderTemplateSvg(input: SvgRenderInput): SvgRenderResult {
  const diagnostics: string[] = [];
  const { width_mm, height_mm } = input.document.page;
  const elements = [...input.document.elements].sort((a, b) => a.z_index - b.z_index || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const content = elements.map((element) => renderElement(element, input.values, diagnostics)).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width_mm}mm" height="${height_mm}mm" viewBox="0 0 ${width_mm} ${height_mm}" role="img" aria-label="${xml(input.ariaLabel)}" preserveAspectRatio="xMidYMid meet"><rect width="${width_mm}" height="${height_mm}" fill="#fff"/>${content}</svg>`;
  return { svg, diagnostics };
}
