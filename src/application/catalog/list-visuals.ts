import type { LifecycleState, TemplateFamily, VisualId } from "../../domain/entities";
import type { CatalogListQuery, CatalogPage, CatalogRepository, CatalogSortField } from "./ports";

export type VisualSortField = CatalogSortField;
export type ListVisualsQuery = Omit<CatalogListQuery, "page" | "page_size"> & {
  readonly page?: number;
  readonly page_size?: number;
};
export interface VisualSummary {
  readonly id: VisualId;
  readonly name: string;
  readonly visual_type: string;
  readonly template_family: TemplateFamily;
  readonly stock_class?: string;
  readonly location?: string;
  readonly flow?: string;
  readonly description?: string;
  readonly lifecycle_state: LifecycleState;
  readonly legacy_source?: string;
}
export type Page<T> = CatalogPage<T>;

export async function listVisuals(query: ListVisualsQuery, repository: CatalogRepository): Promise<Page<VisualSummary>> {
  const page = query.page ?? 1;
  const pageSize = query.page_size ?? 50;
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 200) {
    throw new RangeError("Catalog page must be positive and page_size must be between 1 and 200.");
  }
  const result = await repository.list({ ...query, page, page_size: pageSize });
  return {
    ...result,
    items: result.items.map(({ visual, template_family, legacy_search_text }) => ({ id: visual.id, name: visual.name, visual_type: visual.visual_type, template_family, ...(visual.stock_class ? { stock_class: visual.stock_class } : {}), ...(visual.location ? { location: visual.location } : {}), ...(visual.flow ? { flow: visual.flow } : {}), ...(visual.description ? { description: visual.description } : {}), lifecycle_state: visual.lifecycle_state, ...(legacy_search_text ? { legacy_source: legacy_search_text } : {}) })),
  };
}
