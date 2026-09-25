import type { Visual, VisualId, VisualVersion, VisualVersionId, LifecycleState, TemplateFamily } from "../../domain/entities";

export interface VisualListQuery {
  readonly search?: string;
  readonly lifecycle_state?: LifecycleState;
  readonly template_family?: TemplateFamily;
}

/** Transaction-scoped persistence operations for Visual identities and versions. */
export interface VisualRepository {
  create(visual: Visual): Promise<void>;
  getById(id: VisualId): Promise<Visual | undefined>;
  list(query?: VisualListQuery): Promise<readonly Visual[]>;
  addVersion(version: VisualVersion): Promise<void>;
  setCurrentDraftVersion(visualId: VisualId, versionId: VisualVersionId): Promise<void>;
  setCurrentPublishedVersion(visualId: VisualId, versionId: VisualVersionId): Promise<void>;
}
