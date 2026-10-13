import type { TemplateDocument, Element } from "../../domain/template-document";
import type { VisualDetail } from "./catalog-gateway";
import { validateTemplateDocument } from "../../domain/validation";

export interface TemplatePreview {
  readonly svg: string;
  readonly diagnostics: readonly string[];
}

const xml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
}[character] ?? character));

function binding(path: string, detail: VisualDetail): string {
  const values = detail.current_version?.values ?? {};
  const paths: Record<string, string | undefined> = {
    "visual.name": detail.visual.name,
    "visual.location": detail.visual.location,
    "visual.flow": detail.visual.flow,
    "visual.description": detail.visual.description,
    "visual.stock_class": detail.visual.stock_class,
    "visual.accent_color": detail.visual.accent_color,
    "brand.primary_color": "#D40511",
  };
  const savedValue = values[path];
  return typeof savedValue === "string" ? savedValue : paths[path] ?? "";
}

function resolve<T extends string | null>(value: { readonly kind: "literal"; readonly value: T } | { readonly kind: "binding"; readonly path: string }, detail: VisualDetail): T | string {
  return value.kind === "literal" ? value.value : binding(value.path, detail);
}

function transform(element: Element): string {
  if (!element.rotation_degrees) return "";
  const centerX = element.x_mm + element.width_mm / 2;
  const centerY = element.y_mm + element.height_mm / 2;
  return ` transform="rotate(${element.rotation_degrees} ${centerX} ${centerY})"`;
}

function renderElement(element: Element, detail: VisualDetail, diagnostics: string[]): string {
  if (!element.visible) return "";
  const group = (body: string) => `<g id="${xml(element.id)}"${transform(element)}>${body}</g>`;
  if (element.type === "text") {
    if (element.style.wrapping === "wrap") diagnostics.push(`Text “${element.id}” uses wrapping; line layout is simplified in this preview.`);
    if (element.style.fit_policy !== "none") diagnostics.push(`Text “${element.id}” uses fit-to-box; font fitting is simplified in this preview.`);
    if (element.style.overflow === "ellipsis") diagnostics.push(`Text “${element.id}” requests ellipsis; truncation is simplified to clipping in this preview.`);
    const text = resolve(element.content, detail);
    const color = resolve(element.style.color, detail);
    const anchor = element.style.horizontal_align === "center" ? "middle" : element.style.horizontal_align === "right" ? "end" : "start";
    const x = element.style.horizontal_align === "center" ? element.x_mm + element.width_mm / 2 : element.style.horizontal_align === "right" ? element.x_mm + element.width_mm : element.x_mm;
    const y = element.style.vertical_align === "top" ? element.y_mm + element.style.font_size_pt * 25.4 / 72 : element.style.vertical_align === "bottom" ? element.y_mm + element.height_mm : element.y_mm + element.height_mm / 2;
    const weight = element.style.font_weight === "normal" ? 400 : element.style.font_weight === "bold" ? 700 : element.style.font_weight;
    const style = element.style.font_style === "italic" ? "italic" : "normal";
    const clipId = `clip-${element.id}`;
    return `<defs><clipPath id="${xml(clipId)}"><rect x="${element.x_mm}" y="${element.y_mm}" width="${element.width_mm}" height="${element.height_mm}"/></clipPath></defs><g clip-path="url(#${xml(clipId)})">${group(`<text x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="middle" font-family="${xml(element.style.font_family)}" font-size="${element.style.font_size_pt * 25.4 / 72}" font-weight="${weight}" font-style="${style}" fill="${xml(String(color))}">${xml(String(text))}</text>`)}</g>`;
  }
  if (element.type === "rectangle" || element.type === "band" || element.type === "background") {
    const fill = resolve(element.style.fill, detail);
    const stroke = element.style.stroke ? resolve(element.style.stroke, detail) : "none";
    return group(`<rect x="${element.x_mm}" y="${element.y_mm}" width="${element.width_mm}" height="${element.height_mm}" fill="${xml(String(fill))}" stroke="${xml(String(stroke))}" stroke-width="${element.style.stroke_width_mm}"/>`);
  }
  if (element.type === "line" || element.type === "border") {
    const stroke = resolve(element.style.stroke, detail);
    return group(`<line x1="${element.x_mm}" y1="${element.y_mm}" x2="${element.x_mm + element.width_mm}" y2="${element.y_mm + element.height_mm}" stroke="${xml(String(stroke))}" stroke-width="${element.style.stroke_width_mm}"/>`);
  }
  diagnostics.push(`Image “${element.id}” is not available to the catalog preview.`);
  return group(`<rect x="${element.x_mm}" y="${element.y_mm}" width="${element.width_mm}" height="${element.height_mm}" fill="#f1f2f3" stroke="#777" stroke-dasharray="2 1"/><text x="${element.x_mm + element.width_mm / 2}" y="${element.y_mm + element.height_mm / 2}" text-anchor="middle" dominant-baseline="middle" font-size="3" fill="#555">Image preview unavailable</text>`);
}

export function renderTemplatePreview(detail: VisualDetail): TemplatePreview | null {
  const raw = detail.current_template_version?.document;
  if (!raw) return null;
  const validation = validateTemplateDocument(raw);
  if (!validation.valid) return { svg: "", diagnostics: validation.diagnostics.map(({ message }) => message) };
  const document: TemplateDocument = validation.document;
  const diagnostics: string[] = [];
  const page = document.page;
  const elements = [...document.elements].sort((a, b) => a.z_index - b.z_index || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const content = elements.map((element) => renderElement(element, detail, diagnostics)).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${page.width_mm} ${page.height_mm}" role="img" aria-label="${xml(detail.visual.name)} template preview" preserveAspectRatio="xMidYMid meet"><rect width="${page.width_mm}" height="${page.height_mm}" fill="#fff"/>${content}</svg>`;
  return { svg, diagnostics };
}
