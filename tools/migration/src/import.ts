import { createId, parseId } from "../../../src/domain/ids";
import type { AuditEvent, LegacySourceReference, TemplateFamily, TemplateId, TemplateVersionId, Visual, VisualVersion } from "../../../src/domain/entities";
import type { TemplateDocument } from "../../../src/domain/template-document";
import { validateOptionalColorTokens } from "../../../src/domain/validation";
import type { MigrationBaseline, MigrationReport } from "./reconcile";
import { reconcileMigration } from "./reconcile";
import { mapStagingCatalog, type StagedVisual } from "./staging";

export interface SelectedTemplate {
  readonly template_id: Visual["template_id"];
  readonly template_version_id: VisualVersion["template_version_id"];
}

export interface ResolvedTemplateSelection {
  readonly template: { readonly id: TemplateId; readonly family: TemplateFamily };
  readonly version: { readonly id: TemplateVersionId; readonly template_id: TemplateId; readonly document: TemplateDocument };
}

export interface MigrationTemplateResolver {
  /** Reads the persisted template and version to verify both identity and family before import. */
  getSelection(templateId: TemplateId, versionId: TemplateVersionId): Promise<ResolvedTemplateSelection | undefined>;
}

export interface MigrationImportBatch {
  readonly batch_id: string;
  readonly visuals: readonly Visual[];
  readonly versions: readonly VisualVersion[];
  readonly source_references: readonly LegacySourceReference[];
  readonly audit_events: readonly AuditEvent[];
  readonly source_files: readonly { readonly path: string; readonly sha256: string; readonly byte_length: number }[];
  readonly report: MigrationReport;
}

export type MigrationImportPersistence = Omit<MigrationImportBatch, "source_files" | "report">;

export interface MigrationImportRepository {
  /** Must insert identities, versions, references, pointer changes, and audit events in one transaction. */
  importAtomically(batch: MigrationImportPersistence): Promise<void>;
}

export interface SelectedSourceReader {
  /** Read-only access to one path explicitly selected by the operator. */
  read(path: string): Promise<Uint8Array>;
}

export interface ImportSelectedSourcesOptions {
  readonly paths: readonly string[];
  readonly reader: SelectedSourceReader;
  readonly baseline: MigrationBaseline;
  readonly templates: Readonly<Record<TemplateFamily, SelectedTemplate>>;
  readonly template_resolver: MigrationTemplateResolver;
  readonly repository: MigrationImportRepository;
  readonly migration_batch: string;
  readonly now?: () => string;
  readonly new_id?: (kind: "visual_version" | "legacy_source_reference" | "audit_event") => string;
}

function parseCatalog(bytes: Uint8Array, path: string): unknown {
  try {
    const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(json) as unknown;
  } catch {
    throw new Error(`Selected source is not valid UTF-8 JSON: ${path}`);
  }
}

function basename(path: string): string {
  return path.split(/[\\/]/u).filter(Boolean).at(-1) ?? path;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sourceState(row: StagedVisual): LegacySourceReference["validation_state"] {
  return row.template_family === "gang-special-2up" ? "pending" : row.validation_state;
}

function requiredVisualBindings(document: TemplateDocument): readonly string[] {
  const paths = new Set<string>();
  const add = (binding: { readonly kind: string; readonly path?: string }): void => {
    if (binding.kind === "binding" && binding.path?.startsWith("visual.")) paths.add(binding.path);
  };
  for (const element of document.elements) {
    if (element.type === "text") {
      add(element.content);
      add(element.style.color);
    } else if (element.type === "rectangle" || element.type === "band" || element.type === "background") {
      add(element.style.fill);
      if (element.style.stroke) add(element.style.stroke);
    } else if (element.type === "line" || element.type === "border") {
      add(element.style.stroke);
    }
  }
  return [...paths].sort();
}

function validateRequiredBindings(row: StagedVisual, document: TemplateDocument): StagedVisual {
  const missing = requiredVisualBindings(document).filter((path) => {
    const field = path.slice("visual.".length);
    const value = field === "name" ? row.name : row.fields[field];
    return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
  });
  const colorIssues = validateOptionalColorTokens({ accent_color: row.fields.accent_color }, `record ${row.id}`);
  if (missing.length === 0 && colorIssues.length === 0) return row;
  return {
    ...row,
    row_issues: [
      ...row.row_issues,
      ...missing.map((path) => `record ${row.id}: required binding ${path} has no value`),
      ...colorIssues.map((issue) => `record ${row.id}: invalid color token at ${issue.path}`),
    ],
  };
}

/** Imports only explicitly selected paths; no discovery, writes, or mutation of originals is exposed. */
export async function importSelectedSources(options: ImportSelectedSourcesOptions): Promise<MigrationImportBatch> {
  if (options.paths.length === 0 || options.paths.some((path) => !path.trim())) {
    throw new Error("Select at least one non-empty source path.");
  }
  let rows: StagedVisual[] = [];
  const sourceFiles: { path: string; sha256: string; byte_length: number }[] = [];
  for (const path of options.paths) {
    const bytes = await options.reader.read(path);
    const digest = await sha256(bytes);
    const expectedHash = options.baseline.source_file_hashes?.[basename(path)];
    if (!expectedHash || digest !== expectedHash) {
      throw new MigrationSourceHashError(path, expectedHash, digest);
    }
    sourceFiles.push({ path, sha256: digest, byte_length: bytes.byteLength });
    rows.push(...mapStagingCatalog(parseCatalog(bytes, path), options.migration_batch));
  }

  const selections = new Map<TemplateFamily, ResolvedTemplateSelection>();
  for (const family of new Set(rows.map(({ template_family }) => template_family as TemplateFamily))) {
    const selected = options.templates[family];
    if (!selected) continue;
    const resolved = await options.template_resolver.getSelection(selected.template_id, selected.template_version_id);
    if (!resolved || resolved.template.id !== selected.template_id || resolved.version.id !== selected.template_version_id || resolved.version.template_id !== resolved.template.id) {
      throw new MigrationTemplateSelectionError(`Selected template/version for ${family} is missing or mismatched in the catalog.`);
    }
    if (resolved.template.family !== family) {
      throw new MigrationTemplateSelectionError(`Selected template family ${resolved.template.family} does not match staged family ${family}.`);
    }
    selections.set(family, resolved);
  }
  rows = rows.map((row) => {
    const selection = selections.get(row.template_family as TemplateFamily);
    return selection ? validateRequiredBindings(row, selection.version.document) : row;
  });

  const report = await reconcileMigration(rows, options.baseline);
  if (!report.can_import) throw new MigrationReconciliationError(report);

  const now = options.now ?? (() => new Date().toISOString());
  const newId = options.new_id ?? ((kind) => createId(kind));
  const timestamp = now();
  const visuals: Visual[] = [];
  const versions: VisualVersion[] = [];
  const sourceReferences: LegacySourceReference[] = [];
  const auditEvents: AuditEvent[] = [];

  for (const row of rows) {
    const family = row.template_family as TemplateFamily;
    const template = options.templates[family];
    if (!template) throw new Error(`No selected template/version mapping exists for ${family}.`);
    const visualId = parseId(row.id, "visual");
    const versionId = parseId(newId("visual_version"), "visual_version");
    const visual: Visual = {
      id: visualId,
      name: row.name,
      visual_type: row.visual_type,
      template_id: template.template_id,
      ...(typeof row.fields.stock_class === "string" ? { stock_class: row.fields.stock_class } : {}),
      ...(typeof row.fields.location === "string" ? { location: row.fields.location } : {}),
      ...(typeof row.fields.flow === "string" ? { flow: row.fields.flow } : {}),
      ...(typeof row.fields.description === "string" ? { description: row.fields.description } : {}),
      ...(typeof row.fields.accent_color === "string" ? { accent_color: row.fields.accent_color } : {}),
      lifecycle_state: "Draft",
      current_draft_version_id: versionId,
      created_at: timestamp,
      updated_at: timestamp,
    };
    const version: VisualVersion = {
      id: versionId,
      visual_id: visualId,
      version_number: 1,
      template_version_id: template.template_version_id,
      values: row.fields,
      ...(family === "gang-special-2up" ? { special_validation: { state: "pending" as const } } : {}),
      created_at: timestamp,
    };
    const sourceReference: LegacySourceReference = {
      id: parseId(newId("legacy_source_reference"), "legacy_source_reference"),
      visual_id: visualId,
      source_id: row.source.source_id,
      source_name: row.source.source_name,
      ...(row.source.sheet_or_slide ? { sheet_or_slide: row.source.sheet_or_slide } : {}),
      ...(row.source.side ? { side: row.source.side } : {}),
      ...(row.source.raw_source_text ? { raw_source_text: row.source.raw_source_text } : {}),
      migration_batch: row.migration_batch,
      validation_state: sourceState(row),
    };
    visuals.push(visual);
    versions.push(version);
    sourceReferences.push(sourceReference);
    auditEvents.push({
      id: parseId(newId("audit_event"), "audit_event"),
      entity_kind: "visual_version",
      entity_id: versionId,
      version_id: versionId,
      action: "migration_imported",
      occurred_at: timestamp,
      details: { migration_batch: row.migration_batch, source_id: row.source.source_id },
    });
  }

  const batch: MigrationImportBatch = {
    batch_id: options.migration_batch,
    visuals,
    versions,
    source_references: sourceReferences,
    audit_events: auditEvents,
    source_files: sourceFiles,
    report,
  };
  const { source_files: _sourceFiles, report: _report, ...persistence } = batch;
  await options.repository.importAtomically(persistence);
  return batch;
}

export class MigrationSourceHashError extends Error {
  constructor(readonly selected_path: string, readonly expected_hash: string | undefined, readonly actual_hash: string) {
    super(`Selected source file hash does not match the approved baseline: ${basename(selected_path)}.`);
    this.name = "MigrationSourceHashError";
  }
}

export class MigrationTemplateSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationTemplateSelectionError";
  }
}

export class MigrationReconciliationError extends Error {
  constructor(readonly report: MigrationReport) {
    super(`Migration is blocked by ${report.blocking_issues.length} reconciliation issue(s).`);
    this.name = "MigrationReconciliationError";
  }
}
