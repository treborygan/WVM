import { describe, expect, it } from "vitest";

import { createId } from "../../domain/ids";
import type { AuditEvent, Visual, VisualVersion } from "../../domain/entities";
import type { VisualRepository } from "../ports/VisualRepository";
import type { TemplateRepository } from "../ports/TemplateRepository";
import type { AssetRepository } from "../ports/AssetRepository";
import type { RepositoryUnitOfWork, Transaction } from "../ports/Transaction";

describe("repository transaction contract", () => {
  it("coordinates a version, current-pointer update, and audit event in one transaction scope", async () => {
    const writes: string[] = [];
    const visualId = createId("visual");
    const versionId = createId("visual_version");
    const templateId = createId("template");
    const templateVersionId = createId("template_version");
    const visual: Visual = {
      id: visualId,
      name: "Synthetic visual",
      visual_type: "gang",
      template_id: templateId,
      lifecycle_state: "Draft",
      created_at: "2026-09-25T08:00:00.000Z",
      updated_at: "2026-09-25T08:00:00.000Z",
    };
    const version: VisualVersion = {
      id: versionId,
      visual_id: visualId,
      version_number: 1,
      template_version_id: templateVersionId,
      values: { location: "A-01" },
      created_at: "2026-09-25T08:00:00.000Z",
    };
    const auditEvent: AuditEvent = {
      id: createId("audit_event"),
      entity_kind: "visual_version",
      entity_id: versionId,
      version_id: versionId,
      action: "version_created",
      occurred_at: "2026-09-25T08:00:00.000Z",
      details: { source: "synthetic-test" },
    };

    const visuals: VisualRepository = {
      create: async () => { writes.push("visual"); },
      getById: async () => visual,
      list: async () => [visual],
      addVersion: async () => { writes.push("version"); },
      setCurrentDraftVersion: async () => { writes.push("current-pointer"); },
      setCurrentPublishedVersion: async () => { writes.push("published-pointer"); },
    };
    const templates: TemplateRepository = {
      create: async () => { writes.push("template"); },
      getById: async () => undefined,
      list: async () => [],
      addVersion: async () => { writes.push("template-version"); },
      setActivePublishedVersion: async () => { writes.push("template-pointer"); },
    };
    const assets: AssetRepository = {
      create: async () => { writes.push("asset"); },
      getById: async () => undefined,
    };
    const unitOfWork: RepositoryUnitOfWork = {
      visuals,
      templates,
      assets,
      appendAuditEvent: async () => { writes.push("audit"); },
    };
    const transaction: Transaction = {
      run: async (operation) => operation(unitOfWork),
    };

    await transaction.run(async ({ visuals: visualRepository, appendAuditEvent }) => {
      await visualRepository.addVersion(version);
      await visualRepository.setCurrentDraftVersion(visualId, versionId);
      await appendAuditEvent(auditEvent);
    });

    expect(writes).toEqual(["version", "current-pointer", "audit"]);
  });
});
