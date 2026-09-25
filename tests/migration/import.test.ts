/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";

import catalog from "../../fixtures/synthetic/migration/catalog.json";
import catalogSource from "../../fixtures/synthetic/migration/catalog.json?raw";
import expectedReport from "../../fixtures/synthetic/migration/expected-report.json";
import type { TemplateFamily, TemplateId, TemplateVersionId } from "../../src/domain/entities";
import type { TemplateDocument } from "../../src/domain/template-document";
import { importSelectedSources, MigrationReconciliationError, type MigrationImportPersistence } from "../../tools/migration/src/import";

const families: readonly TemplateFamily[] = ["gang-standard-2up", "gang-special-2up", "flow-sticker-12up", "stand-standard-3up", "stand-level-instruction-3up"];
async function baseline() { return expectedReport; }
function templates() {
  return Object.fromEntries(families.map((family) => [family, { template_id: `template-${family}` as TemplateId, template_version_id: `template-version-${family}` as TemplateVersionId }])) as Record<TemplateFamily, { template_id: TemplateId; template_version_id: TemplateVersionId }>;
}
function templateResolver(mapping = templates(), path = "visual.location", familyOverride?: TemplateFamily) {
  return {
    getSelection: async (templateId: TemplateId, versionId: TemplateVersionId) => {
      const family = families.find((candidate) => mapping[candidate].template_id === templateId);
      if (!family) return undefined;
      const document = { elements: [{ type: "text", content: { kind: "binding", path }, style: { color: { kind: "literal", value: "#111111" } } }] } as unknown as TemplateDocument;
      return {
        template: { id: templateId, family: familyOverride ?? family },
        version: { id: versionId, template_id: templateId, document },
      };
    },
  };
}

describe("private migration import boundary", () => {
  it("reads only selected paths and imports preserved identities and provenance atomically as drafts", async () => {
    let inserted: MigrationImportPersistence | undefined;
    const selected = "C:/private/input/catalog.json";
    const ids = ((): (() => string) => { let next = 0; return () => `generated-${++next}`; })();
    const batch = await importSelectedSources({
      paths: [selected],
      reader: { read: async (path) => { expect(path).toBe(selected); return new TextEncoder().encode(catalogSource); } },
      baseline: await baseline(), templates: templates(), template_resolver: templateResolver(), migration_batch: "synthetic-batch-001",
      now: () => "2026-09-25T12:00:00.000Z", new_id: ids,
      repository: { importAtomically: async (value) => { inserted = value; } },
    });
    expect(inserted).toMatchObject({ batch_id: batch.batch_id, visuals: batch.visuals, versions: batch.versions, source_references: batch.source_references });
    expect(inserted).not.toHaveProperty("source_files");
    expect(inserted).not.toHaveProperty("report");
    expect(batch.visuals[0]).toMatchObject({ id: "WVM-SYN-G-001", accent_color: "#336699", lifecycle_state: "Draft", current_draft_version_id: batch.versions[0].id });
    expect(batch.source_references[0]).toMatchObject({ source_id: "SYN-DOC-001", source_name: "synthetic-catalog.pptx", visual_id: "WVM-SYN-G-001" });
    expect(batch.source_files[0]).toMatchObject({ path: selected, sha256: (await baseline()).source_file_hashes["catalog.json"] });
    const special = batch.versions.filter((version) => version.special_validation);
    expect(special).toHaveLength(6);
    expect(special.every((version) => version.special_validation?.state === "pending" && !version.published_at)).toBe(true);
  });

  it("blocks count or hash drift before invoking the transactional repository", async () => {
    let called = false;
    const badBaseline = { ...(await baseline()), total_count: 11 };
    await expect(importSelectedSources({
      paths: ["C:/private/input/catalog.json"], reader: { read: async () => new TextEncoder().encode(catalogSource) },
      baseline: badBaseline, templates: templates(), template_resolver: templateResolver(), migration_batch: "synthetic-batch-001",
      repository: { importAtomically: async () => { called = true; } },
    })).rejects.toBeInstanceOf(MigrationReconciliationError);
    expect(called).toBe(false);
  });

  it("blocks selected source file hash drift and retains only the digest and selected path in the private report", async () => {
    let called = false;
    const modified = { ...catalog, records: catalog.records.slice(0, 9) };
    await expect(importSelectedSources({
      paths: ["C:/private/input/catalog.json"], reader: { read: async () => new TextEncoder().encode(JSON.stringify(modified)) },
      baseline: await baseline(), templates: templates(), template_resolver: templateResolver(), migration_batch: "synthetic-batch-001",
      repository: { importAtomically: async () => { called = true; } },
    })).rejects.toThrow(/source file hash/i);
    expect(called).toBe(false);
  });

  it("rejects a selected template whose persisted family differs from the staged record", async () => {
    let called = false;
    const wrongTemplates = templates();
    wrongTemplates["gang-special-2up"] = wrongTemplates["gang-standard-2up"];
    await expect(importSelectedSources({
      paths: ["C:/private/input/catalog.json"], reader: { read: async () => new TextEncoder().encode(catalogSource) },
      baseline: await baseline(), templates: wrongTemplates, template_resolver: templateResolver(), migration_batch: "synthetic-batch-001",
      repository: { importAtomically: async () => { called = true; } },
    })).rejects.toThrow(/template family/i);
    expect(called).toBe(false);
  });

  it("blocks rows missing fields required by the selected canonical template bindings", async () => {
    let called = false;
    await expect(importSelectedSources({
      paths: ["C:/private/input/catalog.json"], reader: { read: async () => new TextEncoder().encode(catalogSource) },
      baseline: await baseline(), templates: templates(), template_resolver: templateResolver(templates(), "visual.stock_class"), migration_batch: "synthetic-batch-001",
      repository: { importAtomically: async () => { called = true; } },
    })).rejects.toMatchObject({ report: { blocking_issues: expect.arrayContaining([expect.objectContaining({ code: "missing_binding", record_id: "WVM-SYN-G-001" })]) } });
    expect(called).toBe(false);
  });
});
