import { createId } from "../../domain/ids";
import type { LegacySourceReference, Visual, VisualId } from "../../domain/entities";
import type { CatalogRepository } from "./ports";

export interface DraftVisual {
  readonly visual: Visual;
  readonly version: NonNullable<Awaited<ReturnType<CatalogRepository["getCurrentVersion"]>>>;
  readonly source_references: Awaited<ReturnType<CatalogRepository["getSourceReferences"]>>;
}

export async function duplicateVisual(
  id: VisualId,
  repository: CatalogRepository,
  options: { readonly now?: () => string; readonly new_id?: () => VisualId; readonly new_reference_id?: () => LegacySourceReference["id"] } = {},
): Promise<DraftVisual> {
  const source = await repository.getById(id);
  if (!source) throw new Error(`Visual not found: ${id}`);
  const [version, sourceReferences, family] = await Promise.all([
    repository.getCurrentVersion(id), repository.getSourceReferences(id), repository.getTemplateFamily(id),
  ]);
  if (!version) throw new Error(`Visual ${id} has no current version to duplicate.`);
  if (!family) throw new Error(`Template family is unavailable for visual ${id}.`);
  const now = (options.now ?? (() => new Date().toISOString()))();
  const newVisualId = (options.new_id ?? (() => createId("visual")))();
  const newVersionId = createId("visual_version");
  const newReferenceId = options.new_reference_id ?? (() => createId("legacy_source_reference"));
  const copiedVisual: Visual = {
    ...source,
    id: newVisualId,
    name: `${source.name} copy`,
    lifecycle_state: "Draft",
    current_draft_version_id: newVersionId,
    current_published_version_id: undefined,
    created_at: now,
    updated_at: now,
  };
  const copiedVersion = {
    ...version,
    id: newVersionId,
    visual_id: newVisualId,
    version_number: 1,
    created_at: now,
    published_at: undefined,
    ...(family === "gang-special-2up" ? { special_validation: { state: "pending" as const } } : {}),
  };
  const copiedReferences = sourceReferences.map((reference) => ({
    ...reference,
    id: newReferenceId(),
    visual_id: newVisualId,
    migration_batch: `duplicate:${newVisualId}:${reference.migration_batch}`,
  }));
  await repository.createDraftCopy(copiedVisual, copiedVersion, copiedReferences, newVisualId, now);
  return { visual: copiedVisual, version: copiedVersion, source_references: copiedReferences };
}
