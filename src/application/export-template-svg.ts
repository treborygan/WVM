import type { TemplateDocument } from "../domain/template-document";
import { validateTemplateDocument } from "../domain/validation";
import { renderTemplateSvg } from "../rendering/svg-renderer";

export interface SvgFilePort {
  chooseDestination(suggestedFileName: string): Promise<string | null>;
  writeText(path: string, contents: string): Promise<void>;
}

export type ExportSvgResult =
  | { readonly status: "cancelled" }
  | { readonly status: "invalid"; readonly diagnostics: readonly string[] }
  | { readonly status: "saved"; readonly path: string; readonly diagnostics: readonly string[] };

export interface ExportSvgRequest {
  readonly document: TemplateDocument;
  readonly values: Readonly<Record<string, string | number | boolean | null>>;
  readonly visualName: string;
}

export function suggestedSvgFileName(name: string): string {
  const safeName = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 120);
  const stem = safeName || "warehouse-visual";
  const windowsReservedName = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem) ? `_${stem}` : stem;
  return `${windowsReservedName}.svg`;
}

export async function exportTemplateDocumentAsSvg(request: ExportSvgRequest, files: SvgFilePort): Promise<ExportSvgResult> {
  const validation = validateTemplateDocument(request.document);
  if (!validation.valid) return { status: "invalid", diagnostics: validation.diagnostics.map(({ message }) => message) };
  const rendered = renderTemplateSvg({ document: validation.document, values: request.values, ariaLabel: `${request.visualName} artwork` });
  const path = await files.chooseDestination(suggestedSvgFileName(request.visualName));
  if (!path) return { status: "cancelled" };
  await files.writeText(path, rendered.svg);
  return { status: "saved", path, diagnostics: rendered.diagnostics };
}
