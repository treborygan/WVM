import type { AuditEvent } from "../../domain/entities";
import type { AssetRepository } from "./AssetRepository";
import type { TemplateRepository } from "./TemplateRepository";
import type { VisualRepository } from "./VisualRepository";

/** Repositories in this scope share the transaction opened by Transaction.run. */
export interface RepositoryUnitOfWork {
  readonly assets: AssetRepository;
  readonly templates: TemplateRepository;
  readonly visuals: VisualRepository;
  appendAuditEvent(event: AuditEvent): Promise<void>;
}

/** Runs a group of repository writes atomically; an error rolls back the complete unit. */
export interface Transaction {
  run<Result>(operation: (unitOfWork: RepositoryUnitOfWork) => Promise<Result>): Promise<Result>;
}
