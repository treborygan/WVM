import { invoke } from "@tauri-apps/api/core";

import type { TemplateFamily, TemplateVersion, Visual, VisualVersion } from "../../domain/entities";
import type { TemplateDocument } from "../../domain/template-document";

export type LifecycleAction = "submit_for_review" | "return_to_draft" | "publish" | "retire" | "reactivate";

export interface VisualRow extends Visual {
  readonly template_family: TemplateFamily;
  readonly legacy_search_text?: string;
}

export interface CatalogPage {
  readonly items: readonly VisualRow[];
  readonly page: number;
  readonly page_size: number;
  readonly total: number;
  readonly total_pages: number;
}

export interface VisualDetail {
  readonly visual: Visual;
  readonly template_family: TemplateFamily;
  readonly current_version?: VisualVersion;
  readonly current_template_version?: TemplateVersion;
  readonly history: readonly VisualVersion[];
  readonly source_references: readonly { readonly source_id: string; readonly source_name: string; readonly sheet_or_slide?: string }[];
}

export interface TemplateChoice {
  readonly template: { readonly id: string; readonly family: TemplateFamily; readonly name: string; readonly visual_type: string; readonly lifecycle_state: string };
  readonly selected_version_id: string;
  readonly selected_version_number: number;
}

export interface CatalogListQuery {
  readonly search?: string;
  readonly visual_type?: string;
  readonly template_family?: TemplateFamily;
  readonly stock_class?: string;
  readonly location?: string;
  readonly flow?: string;
  readonly description?: string;
  readonly legacy_source?: string;
  readonly lifecycle_state?: string;
  readonly sort_by?: string;
  readonly sort_order?: string;
  readonly page: number;
  readonly page_size: number;
}

export interface VisualFields {
  readonly name: string;
  readonly visual_type: string;
  readonly stock_class?: string;
  readonly location?: string;
  readonly flow?: string;
  readonly description?: string;
  readonly accent_color?: string;
}

export interface CreateVisualRequest {
  readonly template_id: string;
  readonly template_version_id: string;
  readonly visual: VisualFields;
  readonly values: Readonly<Record<string, string | number | boolean | null>>;
  readonly actor?: string;
}

export interface SaveDraftRequest {
  readonly visual_id: string;
  readonly expected_revision_id: string;
  readonly template_version_id: string;
  readonly template_document?: TemplateDocument;
  readonly visual: VisualFields;
  readonly values: Readonly<Record<string, string | number | boolean | null>>;
  readonly notes?: string;
  readonly special_validation?: Readonly<Record<string, unknown>>;
  readonly actor?: string;
}

export interface TransitionRequest {
  readonly visual_id: string;
  readonly expected_state: string;
  readonly expected_revision_id: string;
  readonly action: LifecycleAction;
  readonly actor?: string;
}

export interface CatalogGateway {
  list(query: CatalogListQuery): Promise<CatalogPage>;
  templates(query?: { readonly search?: string }): Promise<readonly TemplateChoice[]>;
  detail(id: string): Promise<VisualDetail>;
  create(request: CreateVisualRequest): Promise<VisualDetail>;
  duplicate(id: string, actor?: string): Promise<VisualDetail>;
  saveDraft(request: SaveDraftRequest): Promise<VisualDetail>;
  transition(request: TransitionRequest): Promise<VisualDetail>;
  initializeSyntheticSamples(): Promise<void>;
}

export const desktopCatalogGateway: CatalogGateway = {
  list: async (query) => {
    const page = await invoke<{ readonly items: readonly { readonly visual: Visual; readonly template_family: TemplateFamily; readonly legacy_search_text?: string }[]; readonly page: number; readonly page_size: number; readonly total: number; readonly total_pages: number }>("catalog_list", { query });
    return { ...page, items: page.items.map(({ visual, template_family, legacy_search_text }) => ({ ...visual, template_family, legacy_search_text })) };
  },
  templates: (query = {}) => invoke<readonly TemplateChoice[]>("catalog_templates", { query }),
  detail: (visualId) => invoke<VisualDetail>("catalog_detail", { visualId }),
  create: (request) => invoke<VisualDetail>("catalog_create", { request }),
  duplicate: (visualId, actor) => invoke<VisualDetail>("catalog_duplicate", { visualId, actor }),
  saveDraft: (request) => invoke<VisualDetail>("catalog_save_draft", { request }),
  transition: (request) => invoke<VisualDetail>("catalog_transition", { request }),
  initializeSyntheticSamples: () => invoke<void>("catalog_initialize_synthetic_samples"),
};
