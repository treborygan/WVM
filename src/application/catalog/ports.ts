import type { LegacySourceReference, TemplateFamily, Visual, VisualId, VisualVersion } from "../../domain/entities";

export interface CatalogRecord {
  readonly visual: Visual;
  readonly template_family: TemplateFamily;
  readonly legacy_search_text?: string;
}

export interface CatalogRepository {
  list(): Promise<readonly CatalogRecord[]>;
  getById(id: VisualId): Promise<Visual | undefined>;
  getCurrentVersion(id: VisualId): Promise<VisualVersion | undefined>;
  getSourceReferences(id: VisualId): Promise<readonly LegacySourceReference[]>;
  getTemplateFamily(id: VisualId): Promise<TemplateFamily | undefined>;
  /** Creates identity, copied version, source references, and audit event in one transaction. */
  createDraftCopy(visual: Visual, version: VisualVersion, references: readonly LegacySourceReference[], newId: VisualId, now: string): Promise<void>;
}
