import { vi } from "vitest";

import { parseId } from "../../../domain/ids";
import type { LifecycleAction, CatalogGateway, CatalogPage, VisualDetail, VisualRow } from "../catalog-gateway";

const initial: VisualDetail = {
  visual: {
    id: parseId("visual-1", "visual"), name: "Aisle marker A-01", visual_type: "gang", template_id: parseId("template-gang-standard-2up", "template"),
    stock_class: "Standard", location: "A-01", flow: "Inbound", description: "A synthetic aisle marker.",
    accent_color: "#D40511", lifecycle_state: "Published", current_published_version_id: parseId("version-2", "visual_version"),
    created_at: "2026-10-13T12:00:00.000Z", updated_at: "2026-10-13T12:00:00.000Z",
  },
  template_family: "gang-standard-2up",
  current_version: {
    id: parseId("version-2", "visual_version"), visual_id: parseId("visual-1", "visual"), version_number: 2, template_version_id: parseId("template-version-1", "template_version"),
    values: { location: "A-01", flow: "Inbound" }, created_at: "2026-10-13T12:00:00.000Z", published_at: "2026-10-13T12:00:00.000Z",
  },
  history: [
    { id: parseId("version-1", "visual_version"), visual_id: parseId("visual-1", "visual"), version_number: 1, template_version_id: parseId("template-version-1", "template_version"), values: { location: "A-01" }, created_at: "2026-10-12T12:00:00.000Z" },
    { id: parseId("version-2", "visual_version"), visual_id: parseId("visual-1", "visual"), version_number: 2, template_version_id: parseId("template-version-1", "template_version"), values: { location: "A-01", flow: "Inbound" }, created_at: "2026-10-13T12:00:00.000Z", published_at: "2026-10-13T12:00:00.000Z" },
  ],
  source_references: [],
};

const makeRow = (detail: VisualDetail): VisualRow => ({ ...detail.visual, template_family: detail.template_family });

export function syntheticCatalog(): CatalogGateway {
  let current = initial;
  let rows: VisualRow[] = [makeRow(initial)];
  const page = (): CatalogPage => ({ items: rows, page: 1, page_size: 50, total: rows.length, total_pages: rows.length ? 1 : 0 });
  const list = vi.fn(async (): Promise<CatalogPage> => page());
  const templates = vi.fn(async () => [{
    template: { id: "template-gang-standard-2up", family: "gang-standard-2up" as const, name: "Gang standard 2-up · sample", visual_type: "gang", lifecycle_state: "Draft" },
    selected_version_id: "template-version-1", selected_version_number: 1,
  }]);
  const detail = vi.fn(async (id: string) => id === current.visual.id ? current : initial);
  const create = vi.fn(async (request: import("../catalog-gateway").CreateVisualRequest): Promise<VisualDetail> => {
    current = {
      ...initial,
      visual: { ...initial.visual, id: parseId("visual-new", "visual"), name: request.visual.name, location: request.visual.location, template_id: parseId(request.template_id, "template"), lifecycle_state: "Draft", current_published_version_id: undefined, current_draft_version_id: parseId("version-new", "visual_version") },
      current_version: { ...initial.history[0], id: parseId("version-new", "visual_version"), visual_id: parseId("visual-new", "visual"), version_number: 1, values: request.values, published_at: undefined },
      history: [{ ...initial.history[0], id: parseId("version-new", "visual_version"), visual_id: parseId("visual-new", "visual"), version_number: 1, values: request.values, published_at: undefined }],
    };
    rows = [makeRow(current), ...rows];
    return current;
  });
  const duplicate = vi.fn(async () => {
    current = { ...initial, visual: { ...initial.visual, id: parseId("visual-copy", "visual"), name: "Synthetic receiving marker copy", lifecycle_state: "Draft", current_published_version_id: undefined, current_draft_version_id: parseId("version-copy", "visual_version") }, current_version: { ...initial.history[0], id: parseId("version-copy", "visual_version"), visual_id: parseId("visual-copy", "visual"), version_number: 1, published_at: undefined }, history: [{ ...initial.history[0], id: parseId("version-copy", "visual_version"), visual_id: parseId("visual-copy", "visual"), version_number: 1, published_at: undefined }] };
    rows = [makeRow(current), ...rows];
    return current;
  });
  const saveDraft = vi.fn(async (request: import("../catalog-gateway").SaveDraftRequest): Promise<VisualDetail> => {
    const savedVersion = { ...initial.history[1], id: parseId("version-3", "visual_version"), visual_id: parseId(request.visual_id, "visual"), version_number: 3, values: request.values, published_at: undefined };
    current = { ...current, visual: { ...current.visual, ...request.visual, lifecycle_state: "Draft", current_draft_version_id: savedVersion.id }, current_version: savedVersion, history: [...current.history, savedVersion] };
    rows = rows.map((row) => row.id === current.visual.id ? makeRow(current) : row);
    return current;
  });
  const transition = vi.fn(async (request: { action: LifecycleAction; visual_id: string }): Promise<VisualDetail> => {
    const next = request.action === "submit_for_review" ? "Review" : request.action === "publish" ? "Published" : request.action === "retire" ? "Retired" : request.action === "reactivate" ? "Draft" : "Draft";
    current = { ...current, visual: { ...current.visual, lifecycle_state: next } };
    rows = rows.map((row) => row.id === request.visual_id ? makeRow(current) : row);
    return current;
  });
  const initializeSyntheticSamples = vi.fn(async () => {
    rows = [makeRow(initial)];
    current = initial;
  });
  return { list, templates, detail, create, duplicate, saveDraft, transition, initializeSyntheticSamples };
}
