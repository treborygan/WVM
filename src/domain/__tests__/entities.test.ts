import { describe, expect, it } from "vitest";

import { createId, parseId } from "../ids";
import { validateTemplateDocument } from "../validation";
import { validateOptionalColorTokens } from "../validation";
import type {
  Asset,
  AuditEvent,
  BrandProfile,
  LegacySourceReference,
  Template,
  TemplateVersion,
  Visual,
  VisualVersion,
} from "../entities";

describe("canonical domain IDs", () => {
  it("preserves an imported legacy ID while parsing it as a branded ID", () => {
    expect(parseId("POC-GANG-124", "visual")).toBe("POC-GANG-124");
    expect(parseId("Legacy Gang 124", "visual")).toBe("Legacy Gang 124");
  });

  it.each(["", "   ", " leading", "trailing ", "id\nwith-control"])("rejects malformed IDs %j", (input) => {
    expect(() => parseId(input, "visual")).toThrow();
  });

  it.each(Array.from({ length: 0x20 }, (_, index) => String.fromCharCode(0x80 + index)))(
    "rejects C1 control character %j in IDs",
    (control) => {
      expect(() => parseId(`id${control}with-control`, "visual")).toThrow();
    },
  );

  it("generates stable-format globally unique IDs", () => {
    const first = createId("visual");
    const second = createId("visual");

    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(second).not.toBe(first);
  });
});

describe("entity contracts", () => {
  it("rejects malformed optional brand and visual color tokens", () => {
    expect(validateOptionalColorTokens({ primary_color: "definitely-not-a-color" })).toContainEqual(
      expect.objectContaining({ code: "color_literal_invalid", path: "primary_color" }),
    );
    expect(validateOptionalColorTokens({ accent_color: "definitely-not-a-color" })).toContainEqual(
      expect.objectContaining({ code: "color_literal_invalid", path: "accent_color" }),
    );
  });

  it("exports the canonical identity and version entity contracts", () => {
    const validated = validateTemplateDocument({
      schema_version: 1,
      page: { width_mm: 100, height_mm: 100, orientation: "portrait" },
      print_rules: {
        copies_per_page: 1,
        margins_mm: { top: 0, right: 0, bottom: 0, left: 0 },
        gap_mm: 0,
        slots: { rows: 1, columns: 1 },
      },
      repetition: { kind: "none" },
      defaults: {},
      elements: [],
    });
    if (!validated.valid) throw new Error("The minimal document fixture must be valid.");

    const asset = {
      id: createId("asset"),
      kind: "logo",
      original_name: "synthetic-logo.svg",
      mime_type: "image/svg+xml",
      content_hash: "sha256:synthetic",
      storage_locator: "assets/synthetic-logo.svg",
      created_at: "2026-09-25T08:00:00.000Z",
    } satisfies Asset;
    const brand = {
      id: createId("brand_profile"),
      name: "Synthetic Brand",
      logo_asset_id: asset.id,
      primary_color: "#111111",
      updated_at: "2026-09-25T08:00:00.000Z",
    } satisfies BrandProfile;
    const template = {
      id: createId("template"),
      family: "gang-standard-2up",
      name: "Synthetic Gang",
      visual_type: "gang",
      lifecycle_state: "Draft",
      created_at: "2026-09-25T08:00:00.000Z",
      updated_at: "2026-09-25T08:00:00.000Z",
    } satisfies Template;
    const templateVersion = {
      id: createId("template_version"),
      template_id: template.id,
      version_number: 1,
      document: validated.document,
      created_at: "2026-09-25T08:00:00.000Z",
    } satisfies TemplateVersion;
    const visual = {
      id: createId("visual"),
      name: "Synthetic visual",
      visual_type: "gang",
      template_id: template.id,
      lifecycle_state: "Draft",
      created_at: "2026-09-25T08:00:00.000Z",
      updated_at: "2026-09-25T08:00:00.000Z",
    } satisfies Visual;
    const visualVersion = {
      id: createId("visual_version"),
      visual_id: visual.id,
      version_number: 1,
      template_version_id: templateVersion.id,
      values: { location: "A-01" },
      created_at: "2026-09-25T08:00:00.000Z",
    } satisfies VisualVersion;
    const sourceReference = {
      id: createId("legacy_source_reference"),
      visual_id: visual.id,
      source_id: "synthetic-legacy-1",
      source_name: "synthetic-input",
      migration_batch: "synthetic-batch",
      validation_state: "unreviewed",
    } satisfies LegacySourceReference;
    const auditEvent = {
      id: createId("audit_event"),
      entity_kind: "visual",
      entity_id: visual.id,
      action: "created",
      occurred_at: "2026-09-25T08:00:00.000Z",
      details: { source: "synthetic-test" },
    } satisfies AuditEvent;
    const contracts = [asset, brand, template, templateVersion, visual, visualVersion, sourceReference, auditEvent];

    expect(contracts).toHaveLength(8);
  });
});
