import { validateTemplateDocument } from "../../domain/validation";
import { renderTemplateSvg } from "../../rendering/svg-renderer";
import type { VisualDetail } from "./catalog-gateway";

export interface TemplatePreview {
  readonly svg: string;
  readonly diagnostics: readonly string[];
}

export function renderTemplatePreview(detail: VisualDetail): TemplatePreview | null {
  const raw = detail.current_template_version?.document;
  if (!raw) return null;
  const validation = validateTemplateDocument(raw);
  if (!validation.valid) return { svg: "", diagnostics: validation.diagnostics.map(({ message }) => message) };
  const values: Record<string, string | number | boolean | null> = {
    "visual.name": detail.visual.name,
    "visual.location": detail.visual.location ?? null,
    "visual.flow": detail.visual.flow ?? null,
    "visual.description": detail.visual.description ?? null,
    "visual.stock_class": detail.visual.stock_class ?? null,
    "visual.accent_color": detail.visual.accent_color ?? null,
    "brand.primary_color": "#D40511",
  };
  for (const [path, value] of Object.entries(detail.current_version?.values ?? {})) {
    if (typeof value === "string") values[path] = value;
  }
  return renderTemplateSvg({ document: validation.document, values, ariaLabel: `${detail.visual.name} template preview` });
}
