import { buildTemplateRenderScene, type RenderScene, type RenderSceneElement } from "./render-scene";

export interface SvgRenderResult {
  readonly svg: string;
  readonly diagnostics: readonly string[];
}

export interface SvgRenderInput {
  readonly document: Parameters<typeof buildTemplateRenderScene>[0]["document"];
  readonly values: Parameters<typeof buildTemplateRenderScene>[0]["values"];
  readonly ariaLabel: string;
  readonly assets?: Parameters<typeof buildTemplateRenderScene>[0]["assets"];
}

const xml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
}[character] ?? character));

function transformAttribute(element: RenderSceneElement): string {
  return element.transform ? ` transform="${xml(element.transform)}"` : "";
}

function renderSceneElement(element: RenderSceneElement): string {
  const groupOpen = `<g id="${xml(element.id)}"${transformAttribute(element)}>`;
  const groupClose = "</g>";
  if (element.kind === "text") {
    return `${groupOpen}<defs><clipPath id="${element.clip_path_id}"><rect x="${element.x_mm}" y="${element.y_mm}" width="${element.width_mm}" height="${element.height_mm}"/></clipPath></defs><g clip-path="url(#${element.clip_path_id})"><text x="${element.text_x_mm}" y="${element.text_y_mm}" text-anchor="${element.text_anchor}" dominant-baseline="middle" font-family="${xml(element.font_family)}" font-size="${element.font_size_mm}" font-weight="${element.font_weight}" font-style="${element.font_style}" fill="${xml(element.fill)}">${xml(element.content)}</text></g>${groupClose}`;
  }
  if (element.kind === "shape") {
    return `${groupOpen}<rect x="${element.x_mm}" y="${element.y_mm}" width="${element.width_mm}" height="${element.height_mm}" fill="${xml(element.fill)}" stroke="${xml(element.stroke)}" stroke-width="${element.stroke_width_mm}"/>${groupClose}`;
  }
  if (element.kind === "line") {
    return `${groupOpen}<line x1="${element.x_mm}" y1="${element.y_mm}" x2="${element.x_mm + element.width_mm}" y2="${element.y_mm + element.height_mm}" stroke="${xml(element.stroke)}" stroke-width="${element.stroke_width_mm}"/>${groupClose}`;
  }
  if (element.href) {
    return `${groupOpen}<image x="${element.x_mm}" y="${element.y_mm}" width="${element.width_mm}" height="${element.height_mm}" href="${element.href}" preserveAspectRatio="${element.preserve_aspect_ratio}"/>${groupClose}`;
  }
  return `${groupOpen}<rect x="${element.x_mm}" y="${element.y_mm}" width="${element.width_mm}" height="${element.height_mm}" fill="#f1f2f3" stroke="#777" stroke-dasharray="2 1"/><text x="${element.x_mm + element.width_mm / 2}" y="${element.y_mm + element.height_mm / 2}" text-anchor="middle" dominant-baseline="middle" font-size="3" fill="#555">Image preview unavailable</text>${groupClose}`;
}

export function renderTemplateSceneSvg(scene: RenderScene): SvgRenderResult {
  const { width_mm, height_mm } = scene.page;
  const content = scene.elements.map(renderSceneElement).join("");
  const title = `<title id="wvm-svg-title">${xml(scene.ariaLabel)}</title>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width_mm}mm" height="${height_mm}mm" viewBox="0 0 ${width_mm} ${height_mm}" role="img" aria-label="${xml(scene.ariaLabel)}" preserveAspectRatio="xMidYMid meet">${title}<rect width="${width_mm}" height="${height_mm}" fill="${scene.backgroundColor}"/>${content}</svg>`;
  return { svg, diagnostics: scene.diagnostics };
}

export function renderTemplateSvg(input: SvgRenderInput): SvgRenderResult {
  return renderTemplateSceneSvg(buildTemplateRenderScene(input));
}
