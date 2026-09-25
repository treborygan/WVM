import type { LifecycleState, TemplateFamily, VisualId } from "../../domain/entities";
import type { CatalogRepository } from "./ports";

export type VisualSortField = "name" | "visual_type" | "template_family" | "stock_class" | "location" | "flow" | "description" | "lifecycle_state" | "legacy_source";
export interface ListVisualsQuery {
  readonly search?: string;
  readonly visual_type?: string;
  readonly template_family?: TemplateFamily;
  readonly stock_class?: string;
  readonly location?: string;
  readonly flow?: string;
  readonly description?: string;
  readonly lifecycle_state?: LifecycleState;
  readonly legacy_source?: string;
  readonly sort_by?: VisualSortField;
  readonly sort_order?: "asc" | "desc";
  readonly page?: number;
  readonly page_size?: number;
}
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
export interface Page<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly page_size: number;
  readonly total: number;
  readonly total_pages: number;
}

function normalized(value: string | undefined): string { return value?.toLocaleLowerCase() ?? ""; }

export async function listVisuals(query: ListVisualsQuery, repository: CatalogRepository): Promise<Page<VisualSummary>> {
  const page = query.page ?? 1;
  const pageSize = query.page_size ?? 50;
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 200) {
    throw new RangeError("Catalog page must be positive and page_size must be between 1 and 200.");
  }
  const records = await repository.list();
  const filters: (keyof ListVisualsQuery)[] = ["visual_type", "template_family", "stock_class", "location", "flow", "description", "lifecycle_state", "legacy_source"];
  const matched = records.map(({ visual, template_family, legacy_search_text }) => ({
    visual, template_family, legacy_search_text,
    searchable: [visual.name, visual.visual_type, template_family, visual.stock_class, visual.location, visual.flow, visual.description, visual.lifecycle_state, legacy_search_text].map(normalized).join("\n"),
  })).filter((record) => {
    if (query.search && !record.searchable.includes(normalized(query.search.trim()))) return false;
    return filters.every((key) => {
      const expected = query[key];
      if (expected === undefined) return true;
      if (key === "legacy_source") return normalized(record.legacy_search_text).includes(normalized(String(expected)));
      const field = key === "visual_type" ? record.visual.visual_type : key === "template_family" ? record.template_family : key === "stock_class" ? record.visual.stock_class : key === "location" ? record.visual.location : key === "flow" ? record.visual.flow : key === "description" ? record.visual.description : record.visual.lifecycle_state;
      return normalized(String(field)) === normalized(String(expected));
    });
  });
  const sortBy = query.sort_by ?? "name";
  const direction = query.sort_order === "desc" ? -1 : 1;
  matched.sort((left, right) => {
    const value = (record: (typeof matched)[number]): string => sortBy === "template_family" ? record.template_family : sortBy === "legacy_source" ? record.legacy_search_text ?? "" : String(record.visual[sortBy] ?? "");
    return value(left).localeCompare(value(right), undefined, { sensitivity: "base" }) * direction || left.visual.id.localeCompare(right.visual.id);
  });
  const total = matched.length;
  const start = (page - 1) * pageSize;
  return {
    items: matched.slice(start, start + pageSize).map(({ visual, template_family, legacy_search_text }) => ({ id: visual.id, name: visual.name, visual_type: visual.visual_type, template_family, ...(visual.stock_class ? { stock_class: visual.stock_class } : {}), ...(visual.location ? { location: visual.location } : {}), ...(visual.flow ? { flow: visual.flow } : {}), ...(visual.description ? { description: visual.description } : {}), lifecycle_state: visual.lifecycle_state, ...(legacy_search_text ? { legacy_source: legacy_search_text } : {}) })),
    page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize),
  };
}
