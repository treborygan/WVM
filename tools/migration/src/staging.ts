import { parseId } from "../../../src/domain/ids";
import type { TemplateFamily, ValidationState } from "../../../src/domain/entities";

export const TEMPLATE_FAMILIES: readonly TemplateFamily[] = [
  "gang-standard-2up",
  "gang-special-2up",
  "flow-sticker-12up",
  "stand-standard-3up",
  "stand-level-instruction-3up",
];

export interface StagedSourceReference {
  readonly source_id: string;
  readonly source_name: string;
  readonly sheet_or_slide?: string;
  readonly side?: string;
  readonly raw_source_text?: string;
}

export interface StagedVisual {
  readonly id: string;
  readonly name: string;
  readonly visual_type: string;
  readonly template_family: string;
  readonly fields: Readonly<Record<string, string | number | boolean | null>>;
  readonly source: StagedSourceReference;
  readonly migration_batch: string;
  readonly validation_state: ValidationState;
  readonly row_issues: readonly string[];
}

export class InvalidStagingCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStagingCatalogError";
  }
}

function normalizedText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim().replace(/\s+/gu, " ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeFields(value: unknown, issues: string[], row: number): Readonly<Record<string, string | number | boolean | null>> {
  if (!isRecord(value)) {
    issues.push(`row ${row}: malformed fields object`);
    return {};
  }
  const fields: Record<string, string | number | boolean | null> = {};
  const normalizedKeys = new Set<string>();
  for (const [key, raw] of Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) {
    const normalizedKey = key.trim();
    if (!normalizedKey || !(raw === null || typeof raw === "string" || typeof raw === "boolean" || (typeof raw === "number" && Number.isFinite(raw)))) {
      issues.push(`row ${row}: malformed field value at ${key || "<empty>"}`);
      continue;
    }
    if (normalizedKeys.has(normalizedKey)) {
      issues.push(`row ${row}: field key collision after normalization at ${normalizedKey}`);
      continue;
    }
    normalizedKeys.add(normalizedKey);
    fields[normalizedKey] = typeof raw === "string" ? raw.trim().replace(/\s+/gu, " ") : raw;
  }
  return fields;
}

/** Maps only the versioned, documented staging envelope; it never opens or writes source files. */
export function mapStagingCatalog(input: unknown, migrationBatch: string): readonly StagedVisual[] {
  if (!migrationBatch.trim()) throw new InvalidStagingCatalogError("A migration batch ID is required.");
  if (!isRecord(input) || input.schema_version !== 1 || !Array.isArray(input.records)) {
    throw new InvalidStagingCatalogError("Expected a schema_version 1 catalog with a records array.");
  }
  return input.records.map((raw, index) => {
    const row = isRecord(raw) ? raw : {};
    const source = isRecord(row.source) ? row.source : {};
    const issues: string[] = [];
    const id = normalizedText(row.id);
    const name = normalizedText(row.name);
    const visualType = normalizedText(row.visual_type);
    const family = normalizedText(row.template_family);
    const sourceId = normalizedText(source.source_id);
    const sourceName = normalizedText(source.source_name);
    if (!id) issues.push(`row ${index + 1}: missing ID`);
    else {
      try { parseId(id, "visual"); } catch { issues.push(`row ${index + 1}: malformed ID`); }
    }
    if (!name) issues.push(`row ${index + 1}: missing name`);
    if (!visualType) issues.push(`row ${index + 1}: missing visual type`);
    if (!family || !TEMPLATE_FAMILIES.includes(family as TemplateFamily)) issues.push(`row ${index + 1}: unsupported template family`);
    if (!sourceId || !sourceName) issues.push(`row ${index + 1}: malformed source reference`);
    return {
      id: id ?? `invalid-row-${index + 1}`,
      name: name ?? "",
      visual_type: visualType ?? "",
      template_family: family ?? "",
      fields: normalizeFields(row.fields, issues, index + 1),
      source: {
        source_id: sourceId ?? "",
        source_name: sourceName ?? "",
        ...(normalizedText(source.sheet_or_slide) ? { sheet_or_slide: normalizedText(source.sheet_or_slide) } : {}),
        ...(normalizedText(source.side) ? { side: normalizedText(source.side) } : {}),
        ...(typeof source.raw_source_text === "string" ? { raw_source_text: source.raw_source_text } : {}),
      },
      migration_batch: migrationBatch,
      validation_state: family === "gang-special-2up" ? "pending" : "unreviewed",
      row_issues: issues,
    };
  });
}
