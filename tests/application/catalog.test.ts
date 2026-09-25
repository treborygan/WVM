import { describe, expect, it } from "vitest";

import { createId } from "../../src/domain/ids";
import type { Visual, VisualVersion } from "../../src/domain/entities";
import { duplicateVisual } from "../../src/application/catalog/duplicate-visual";
import { getVisualDetail } from "../../src/application/catalog/get-visual-detail";
import { listVisuals } from "../../src/application/catalog/list-visuals";
import type { CatalogRepository } from "../../src/application/catalog/ports";

const visuals: Visual[] = [
  { id: "WVM-SYN-002" as Visual["id"], name: "Beta marker", visual_type: "gang", template_id: "template-gang" as Visual["template_id"], location: "B-02", lifecycle_state: "Draft", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
  { id: "WVM-SYN-001" as Visual["id"], name: "Alpha marker", visual_type: "gang", template_id: "template-gang" as Visual["template_id"], location: "A-01", lifecycle_state: "Draft", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
];
const version: VisualVersion = {
  id: createId("visual_version"), visual_id: visuals[0].id, version_number: 1,
  template_version_id: createId("template_version"), values: { location: "B-02" },
  created_at: "2026-01-01T00:00:00.000Z",
};
const repository: CatalogRepository = {
  list: async () => visuals.map((visual) => ({ visual, template_family: "gang-standard-2up", legacy_search_text: "synthetic source" })),
  getById: async (id) => visuals.find((visual) => visual.id === id),
  getCurrentVersion: async () => version,
  getSourceReferences: async () => [{ id: createId("legacy_source_reference"), visual_id: visuals[0].id, source_id: "SYN-001", source_name: "synthetic.pptx", migration_batch: "synthetic", validation_state: "pending" }],
  getTemplateFamily: async () => "gang-standard-2up",
  createDraftCopy: async (visual, _version, refs) => { expect(refs[0]).toMatchObject({ visual_id: visual.id }); },
};

describe("catalog use cases", () => {
  it("searches, filters, sorts, and pages summaries deterministically", async () => {
    const page = await listVisuals({ search: "marker", sort_by: "name", sort_order: "asc", page: 1, page_size: 1 }, repository);
    expect(page.items.map(({ name }) => name)).toEqual(["Alpha marker"]);
    expect(page).toMatchObject({ total: 2, page: 1, page_size: 1, total_pages: 2 });
  });

  it("loads details with current version, template family, and provenance", async () => {
    const detail = await getVisualDetail(visuals[0].id, repository);
    expect(detail).toMatchObject({ visual: visuals[0], current_version: version, template_family: "gang-standard-2up" });
    expect(detail.source_references[0].source_id).toBe("SYN-001");
  });

  it("duplicates selected content and provenance under a new draft identity", async () => {
    const copy = await duplicateVisual(visuals[0].id, repository, {
      new_id: () => "WVM-SYN-COPY" as Visual["id"],
      new_reference_id: () => "WVM-SYN-REF-COPY" as never,
      now: () => "2026-01-02T00:00:00.000Z",
    });
    expect(copy.visual.id).not.toBe(visuals[0].id);
    expect(copy.visual.lifecycle_state).toBe("Draft");
    expect(copy.version.values).toEqual(version.values);
    expect(copy.source_references[0].source_id).toBe("SYN-001");
    expect(copy.source_references[0].visual_id).toBe(copy.visual.id);
    expect(copy.source_references[0].id).not.toBe("legacy-source-reference");
  });

  it("resets special Gang validation evidence when duplicating into a new draft", async () => {
    const validatedVersion = {
      ...version,
      values: { location: "B-02" },
      special_validation: { state: "validated" as const, reviewer_id: "reviewer-1", reviewed_at: "2026-01-01T00:00:00.000Z", evidence_ref: "evidence-1" },
    };
    const specialRepository: CatalogRepository = {
      ...repository,
      getCurrentVersion: async () => validatedVersion,
      getTemplateFamily: async () => "gang-special-2up",
    };
    const copy = await duplicateVisual(visuals[0].id, specialRepository, {
      new_id: () => "WVM-SYN-SPECIAL-COPY" as Visual["id"],
      new_reference_id: () => "WVM-SYN-SPECIAL-REF" as never,
      now: () => "2026-01-02T00:00:00.000Z",
    });
    expect(copy.version.special_validation).toEqual({ state: "pending" });
  });
});
