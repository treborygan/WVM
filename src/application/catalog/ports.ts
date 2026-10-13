import type { LegacySourceReference, LifecycleState, TemplateFamily, Visual, VisualId, VisualVersion } from "../../domain/entities";

export type CatalogSortField = "name" | "visual_type" | "template_family" | "stock_class" | "location" | "flow" | "description" | "lifecycle_state" | "legacy_source";

export interface CatalogListQuery {
  readonly search?: string;
  readonly visual_type?: string;
  readonly template_family?: TemplateFamily;
  readonly stock_class?: string;
  readonly location?: string;
  readonly flow?: string;
  readonly description?: string;
  readonly legacy_source?: string;
  readonly lifecycle_state?: LifecycleState;
  readonly sort_by?: CatalogSortField;
  readonly sort_order?: "asc" | "desc";
  readonly page: number;
  readonly page_size: number;
}

export interface CatalogPage<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly page_size: number;
  readonly total: number;
  readonly total_pages: number;
}

export interface CatalogRecord {
  readonly visual: Visual;
  readonly template_family: TemplateFamily;
  readonly legacy_search_text?: string;
}

export interface CatalogRepository {
  /** Applies filtering, sorting, and paging in the persistence query. */
  list(query: CatalogListQuery): Promise<CatalogPage<CatalogRecord>>;
  getById(id: VisualId): Promise<Visual | undefined>;
  getCurrentVersion(id: VisualId): Promise<VisualVersion | undefined>;
  getSourceReferences(id: VisualId): Promise<readonly LegacySourceReference[]>;
  getTemplateFamily(id: VisualId): Promise<TemplateFamily | undefined>;
  /** Creates identity, copied version, source references, and audit event in one transaction. */
  createDraftCopy(visual: Visual, version: VisualVersion, references: readonly LegacySourceReference[], newId: VisualId, now: string): Promise<void>;
}
