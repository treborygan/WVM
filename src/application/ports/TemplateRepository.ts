import type { Template, TemplateId, TemplateFamily, TemplateVersion, TemplateVersionId } from "../../domain/entities";

export interface TemplateListQuery {
  readonly search?: string;
  readonly family?: TemplateFamily;
}

/** Transaction-scoped persistence operations for Template identities and versions. */
export interface TemplateRepository {
  create(template: Template): Promise<void>;
  getById(id: TemplateId): Promise<Template | undefined>;
  list(query?: TemplateListQuery): Promise<readonly Template[]>;
  addVersion(version: TemplateVersion): Promise<void>;
  setActivePublishedVersion(templateId: TemplateId, versionId: TemplateVersionId): Promise<void>;
}
