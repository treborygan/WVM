import type { TemplateFamily } from "../../../src/domain/entities";
import { TEMPLATE_FAMILIES, type StagedVisual } from "./staging";

export interface MigrationBaseline {
  readonly total_count: number;
  readonly counts_by_family: Readonly<Record<string, number>>;
  readonly record_ids: readonly string[];
  readonly record_hashes: Readonly<Record<string, string>>;
  readonly source_file_hashes?: Readonly<Record<string, string>>;
}

export interface MigrationIssue {
  readonly code: string;
  readonly record_id?: string;
  readonly message: string;
}

export interface MigrationReport {
  readonly counts: { readonly total: number; readonly by_family: Readonly<Record<string, number>> };
  readonly record_hashes: Readonly<Record<string, string>>;
  readonly special_validation_required: readonly { readonly id: string; readonly state: "pending" }[];
  readonly blocking_issues: readonly MigrationIssue[];
  readonly can_import: boolean;
}

function canonicalRecord(visual: StagedVisual): string {
  const clean = (value: string): string => value.trim().replace(/\s+/gu, " ");
  return JSON.stringify({
    id: visual.id,
    name: clean(visual.name),
    visual_type: clean(visual.visual_type),
    template_family: clean(visual.template_family),
    fields: Object.fromEntries(Object.entries(visual.fields).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key.trim(), typeof value === "string" ? clean(value) : value])),
    source: Object.fromEntries(Object.entries(visual.source).map(([key, value]) => [key, clean(value)])),
  });
}

export async function hashStagedVisual(visual: StagedVisual): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalRecord(visual));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function reconcileMigration(
  staging: readonly StagedVisual[],
  baseline: MigrationBaseline,
): Promise<MigrationReport> {
  const issues: MigrationIssue[] = [];
  const byFamily: Record<string, number> = Object.fromEntries(TEMPLATE_FAMILIES.map((family) => [family, 0]));
  const idCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  const hashes: Record<string, string> = {};
  for (const row of staging) {
    idCounts.set(row.id, (idCounts.get(row.id) ?? 0) + 1);
    const sourceKey = `${row.migration_batch}\u0000${row.source.source_id}`;
    if (row.source.source_id) sourceCounts.set(sourceKey, (sourceCounts.get(sourceKey) ?? 0) + 1);
    for (const problem of row.row_issues) issues.push({ code: problem.includes("family") ? "unsupported_family" : problem.includes("ID") ? "malformed_id" : problem.includes("source") ? "malformed_source_reference" : problem.includes("required binding") ? "missing_binding" : problem.includes("invalid color token") ? "invalid_color_token" : "malformed_row", record_id: row.id, message: problem });
    if (!TEMPLATE_FAMILIES.includes(row.template_family as TemplateFamily)) {
      if (!row.row_issues.some((problem) => problem.includes("unsupported template family"))) issues.push({ code: "unsupported_family", record_id: row.id, message: `Unsupported template family: ${row.template_family}` });
      continue;
    }
    byFamily[row.template_family] += 1;
    hashes[row.id] = await hashStagedVisual(row);
  }
  for (const [id, count] of idCounts) if (count > 1) issues.push({ code: "duplicate_id", record_id: id, message: `Staging contains ${count} rows with this stable ID.` });
  for (const [key, count] of sourceCounts) if (count > 1) {
    const [, sourceId] = key.split("\u0000");
    issues.push({ code: "duplicate_source_reference", message: `Source reference ${sourceId} occurs ${count} times in one migration batch.` });
  }
  if (staging.length !== baseline.total_count) issues.push({ code: "count_mismatch", message: `Expected ${baseline.total_count} records; found ${staging.length}.` });
  for (const family of TEMPLATE_FAMILIES) {
    const expected = baseline.counts_by_family[family] ?? 0;
    if (byFamily[family] !== expected) issues.push({ code: "family_count_mismatch", message: `${family}: expected ${expected}; found ${byFamily[family]}.` });
  }
  const expectedIds = new Set(baseline.record_ids);
  for (const id of new Set(staging.map(({ id }) => id))) {
    if (!expectedIds.has(id)) issues.push({ code: "unexpected_id", record_id: id, message: "ID is not in the approved baseline." });
    if (!baseline.record_hashes[id]) issues.push({ code: "missing_baseline_hash", record_id: id, message: "Approved baseline has no normalized record hash for this ID." });
    else if (hashes[id] !== baseline.record_hashes[id]) issues.push({ code: "hash_mismatch", record_id: id, message: "Normalized record hash differs from the approved baseline." });
  }
  for (const id of expectedIds) if (!idCounts.has(id)) issues.push({ code: "missing_record", record_id: id, message: "Approved baseline record is missing from staging." });
  for (const id of Object.keys(baseline.record_hashes)) if (!expectedIds.has(id)) issues.push({ code: "baseline_hash_without_id", record_id: id, message: "Baseline contains a hash for an ID absent from its record list." });
  const specials = staging.filter((row) => row.template_family === "gang-special-2up");
  return {
    counts: { total: staging.length, by_family: byFamily },
    record_hashes: hashes,
    special_validation_required: specials.map(({ id }) => ({ id, state: "pending" as const })),
    blocking_issues: issues,
    can_import: issues.length === 0,
  };
}
