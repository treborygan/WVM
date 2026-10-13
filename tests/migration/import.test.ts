/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";

import catalog from "../../fixtures/synthetic/migration/catalog.json";
import catalogSource from "../../fixtures/synthetic/migration/catalog.json?raw";
import expectedReport from "../../fixtures/synthetic/migration/expected-report.json";
import type { TemplateFamily } from "../../src/domain/entities";
import { importSelectedSources, MigrationReconciliationError, type MigrationImportPersistence } from "../../tools/migration/src/import";

const families: readonly TemplateFamily[] = ["gang-standard-2up", "gang-special-2up", "flow-sticker-12up", "stand-standard-3up", "stand-level-instruction-3up"];
async function baseline() { return expectedReport; }
function catalogBytes() { return new TextEncoder().encode(catalogSource.replace(/\r\n/gu, "\n")); }
function templates() {
  return Object.fromEntries(families.map((family) => [family, { template_id: `template-${family}` as never, template_version_id: `template-version-${family}` as never }])) as Record<TemplateFamily, { template_id: never; template_version_id: never }>;
}

describe("private migration import boundary", () => {
  it("reads only selected paths and imports preserved identities and provenance atomically as drafts", async () => {
    let inserted: MigrationImportPersistence | undefined;
    const selected = "C:/private/input/catalog.json";
    const ids = ((): (() => string) => { let next = 0; return () => `generated-${++next}`; })();
    const batch = await importSelectedSources({
      paths: [selected],
      reader: { read: async (path) => { expect(path).toBe(selected); return catalogBytes(); } },
      baseline: await baseline(), templates: templates(), migration_batch: "synthetic-batch-001",
      now: () => "2026-09-25T12:00:00.000Z", new_id: ids,
      repository: { importAtomically: async (value) => { inserted = value; } },
    });
    expect(inserted).toMatchObject({ batch_id: batch.batch_id, visuals: batch.visuals, versions: batch.versions, source_references: batch.source_references });
    expect(inserted).not.toHaveProperty("source_files");
    expect(inserted).not.toHaveProperty("report");
    expect(batch.visuals[0]).toMatchObject({ id: "WVM-SYN-G-001", lifecycle_state: "Draft", current_draft_version_id: batch.versions[0].id });
    expect(batch.source_references[0]).toMatchObject({ source_id: "SYN-DOC-001", source_name: "synthetic-catalog.pptx", visual_id: "WVM-SYN-G-001" });
    expect(batch.source_files[0]).toMatchObject({ path: selected, sha256: (await baseline()).source_file_hashes["catalog.json"] });
    const special = batch.versions.filter((version) => version.special_validation);
    expect(special).toHaveLength(6);
    expect(special.every((version) => version.special_validation?.state === "pending" && !version.published_at)).toBe(true);
  });

  it("reports a missing family template selection as a blocking reconciliation diagnostic", async () => {
    const selectedTemplates = templates() as Partial<Record<TemplateFamily, { template_id: never; template_version_id: never }>>;
    delete selectedTemplates["gang-special-2up"];
    await expect(importSelectedSources({
      paths: ["C:/private/input/catalog.json"],
      reader: { read: async () => catalogBytes() },
      baseline: await baseline(),
      templates: selectedTemplates as Record<TemplateFamily, { template_id: never; template_version_id: never }>,
      migration_batch: "synthetic-batch-001",
      repository: { importAtomically: async () => { throw new Error("must not write a partially mapped import"); } },
    })).rejects.toMatchObject({
      name: "MigrationTemplateSelectionError",
      family: "gang-special-2up",
      code: "missing_template_selection",
    });
  });

  it("blocks count or hash drift before invoking the transactional repository", async () => {
    let called = false;
    const badBaseline = { ...(await baseline()), total_count: 11 };
    await expect(importSelectedSources({
      paths: ["C:/private/input/catalog.json"], reader: { read: async () => catalogBytes() },
      baseline: badBaseline, templates: templates(), migration_batch: "synthetic-batch-001",
      repository: { importAtomically: async () => { called = true; } },
    })).rejects.toBeInstanceOf(MigrationReconciliationError);
    expect(called).toBe(false);
  });

  it("blocks selected source file hash drift and retains only the digest and selected path in the private report", async () => {
    let called = false;
    const modified = { ...catalog, records: catalog.records.slice(0, 9) };
    await expect(importSelectedSources({
      paths: ["C:/private/input/catalog.json"], reader: { read: async () => new TextEncoder().encode(JSON.stringify(modified)) },
      baseline: await baseline(), templates: templates(), migration_batch: "synthetic-batch-001",
      repository: { importAtomically: async () => { called = true; } },
    })).rejects.toThrow(/source file hash/i);
    expect(called).toBe(false);
  });
});
