import { describe, expect, it } from "vitest";

import catalog from "../../fixtures/synthetic/migration/catalog.json";
import expectedReport from "../../fixtures/synthetic/migration/expected-report.json";
import { mapStagingCatalog } from "../../tools/migration/src/staging";
import { hashStagedVisual, reconcileMigration } from "../../tools/migration/src/reconcile";

describe("synthetic migration reconciliation", () => {
  it("normalizes records while preserving legacy IDs and source references", () => {
    const staging = mapStagingCatalog(catalog, "synthetic-batch-001");
    expect(staging).toHaveLength(10);
    expect(staging[0]).toMatchObject({
      id: "WVM-SYN-G-001",
      name: "Synthetic aisle marker",
      source: { source_id: "SYN-DOC-001", source_name: "synthetic-catalog.pptx", sheet_or_slide: "Slide 1", side: "front" },
    });
    expect(staging[0].name).toBe("Synthetic aisle marker");
  });

  it("reconciles all five families and the six special validation gates", async () => {
    const staging = mapStagingCatalog(catalog, "synthetic-batch-001");
    const report = await reconcileMigration(staging, expectedReport);
    expect(report.blocking_issues).toEqual([]);
    expect(report.counts.total).toBe(10);
    expect(report.counts.by_family).toMatchObject({
      "gang-standard-2up": 1,
      "gang-special-2up": 6,
      "flow-sticker-12up": 1,
      "stand-standard-3up": 1,
      "stand-level-instruction-3up": 1,
    });
    expect(report.special_validation_required).toHaveLength(6);
    expect(report.special_validation_required.every((entry) => entry.state === "pending")).toBe(true);
  });

  it("blocks count, hash, duplicate ID, malformed-row, and unsupported-family drift", async () => {
    const staging = mapStagingCatalog(catalog, "synthetic-batch-001");
    const changed = { ...staging[0], name: "Changed after approval" };
    const duplicate = { ...staging[1], id: staging[0].id };
    const report = await reconcileMigration(
      [changed, duplicate, { ...staging[2], template_family: "unsupported" }, { ...staging[3], row_issues: ["row 4: malformed source reference"] }, { ...staging[4], source: { ...staging[4].source, source_id: staging[0].source.source_id } }],
      expectedReport,
    );
    expect(report.blocking_issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["count_mismatch", "hash_mismatch", "duplicate_id", "unsupported_family", "malformed_source_reference", "duplicate_source_reference", "missing_record"]),
    );
  });

  it("blocks a baseline that omits a content hash for any approved record", async () => {
    const report = await reconcileMigration(mapStagingCatalog(catalog, "synthetic-batch-001"), {
      ...expectedReport,
      record_hashes: {},
    });
    expect(report.blocking_issues.filter(({ code }) => code === "missing_baseline_hash")).toHaveLength(10);
    expect(report.can_import).toBe(false);
  });

  it("hashes only canonical normalized content and returns stable SHA-256", async () => {
    const staging = mapStagingCatalog(catalog, "synthetic-batch-001");
    expect(await hashStagedVisual(staging[0])).toMatch(/^[a-f0-9]{64}$/);
    expect(await hashStagedVisual({ ...staging[0], name: "  Synthetic aisle marker  " })).toBe(
      await hashStagedVisual(staging[0]),
    );
  });

  it("reports malformed values instead of silently dropping them from staged fields", () => {
    const malformed = {
      schema_version: 1,
      records: [{
        id: "WVM-SYN-MALFORMED", name: "Synthetic malformed row", visual_type: "gang",
        template_family: "gang-standard-2up", fields: { location: { nested: "not a scalar" } },
        source: { source_id: "SYN-MALFORMED", source_name: "synthetic-input.json" },
      }],
    };
    const [row] = mapStagingCatalog(malformed, "synthetic-malformed-batch");
    expect(row.fields).toEqual({});
    expect(row.row_issues).toContain("row 1: malformed field value at location");
  });

  it("blocks field names that collide after normalization", () => {
    const collision = {
      schema_version: 1,
      records: [{
        id: "WVM-SYN-COLLISION", name: "Synthetic collision", visual_type: "gang",
        template_family: "gang-standard-2up", fields: { location: "A-01", " location ": "B-02" },
        source: { source_id: "SYN-COLLISION", source_name: "synthetic-input.json" },
      }],
    };
    expect(mapStagingCatalog(collision, "synthetic-collision-batch")[0].row_issues).toContain(
      "row 1: field key collision after normalization at location",
    );
  });

  it("preserves raw source text exactly for later physical-source comparison", () => {
    const rawText = " KEEP\nOUT  ";
    const source = {
      schema_version: 1,
      records: [{
        id: "WVM-SYN-RAW", name: "Synthetic raw text", visual_type: "gang",
        template_family: "gang-standard-2up", fields: {},
        source: { source_id: "SYN-RAW", source_name: "synthetic-input.json", raw_source_text: rawText },
      }],
    };
    expect(mapStagingCatalog(source, "synthetic-raw-batch")[0].source.raw_source_text).toBe(rawText);
  });
});
