import type { LegacySourceReference, TemplateFamily, Visual, VisualId, VisualVersion } from "../../domain/entities";
import type { CatalogRepository } from "./ports";

export interface VisualDetail {
  readonly visual: Visual;
  readonly template_family: TemplateFamily;
  readonly current_version?: VisualVersion;
  readonly source_references: readonly LegacySourceReference[];
}

export async function getVisualDetail(id: VisualId, repository: CatalogRepository): Promise<VisualDetail> {
  const visual = await repository.getById(id);
  if (!visual) throw new Error(`Visual not found: ${id}`);
  const [template_family, current_version, source_references] = await Promise.all([
    repository.getTemplateFamily(id), repository.getCurrentVersion(id), repository.getSourceReferences(id),
  ]);
  if (!template_family) throw new Error(`Template family is unavailable for visual ${id}.`);
  return { visual, template_family, ...(current_version ? { current_version } : {}), source_references };
}
