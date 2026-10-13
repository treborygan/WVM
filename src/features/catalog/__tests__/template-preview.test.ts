import { describe, expect, it } from "vitest";

import type { ImageElement, TemplateDocument } from "../../../domain/template-document";
import { syntheticCatalog } from "./fixtures";
import { renderTemplatePreview } from "../template-preview";

describe("catalog template preview", () => {
  it("renders the immutable template version with escaped bound values", async () => {
    const gateway = syntheticCatalog();
    const detail = await gateway.detail("visual-1");
    const malicious = { ...detail, visual: { ...detail.visual, location: '<script>alert("x")</script>' } };
    const preview = renderTemplatePreview(malicious);

    expect(preview?.svg).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(preview?.svg).not.toContain("<script>");
    expect(preview?.svg).toContain('viewBox="0 0 210 297"');
    expect(preview?.diagnostics).toEqual([]);
  });

  it("orders overlapping elements deterministically by layer and element id", async () => {
    const gateway = syntheticCatalog();
    const detail = await gateway.detail("visual-1");
    const version = detail.current_template_version!;
    const text = version.document.elements.find((element) => element.type === "text");
    if (!text) throw new Error("Synthetic template fixture must include text.");
    const extra = { ...text, id: "earlier", z_index: 1, content: { kind: "literal" as const, value: "FIRST" } };
    const later = { ...text, id: "later", z_index: 5, content: { kind: "literal" as const, value: "LAST" } };
    const withLayers = { ...detail, current_template_version: { ...version, document: { ...version.document, elements: [later, text, extra] } } };
    const preview = renderTemplatePreview(withLayers)!;

    expect(preview.svg.indexOf(">FIRST<")).toBeLessThan(preview.svg.indexOf(">A-01<"));
    expect(preview.svg.indexOf(">A-01<")).toBeLessThan(preview.svg.indexOf(">LAST<"));
  });

  it("reports that an image cannot be previewed instead of silently omitting it", async () => {
    const detail = await syntheticCatalog().detail("visual-1");
    const version = detail.current_template_version!;
    const element = version.document.elements[0]!;
    const image: ImageElement = { id: "brand-art", type: "image", x_mm: element.x_mm, y_mm: element.y_mm, width_mm: element.width_mm, height_mm: element.height_mm, rotation_degrees: 0, z_index: 1, visible: true, locked: false, source: { kind: "binding", path: "brand.logo" }, fit: "contain" };
    const updated = { ...detail, current_template_version: { ...version, document: { ...version.document, elements: [image] } } };

    const preview = renderTemplatePreview(updated)!;
    expect(preview.svg).toContain("Image preview unavailable");
    expect(preview.diagnostics).toEqual(['Image “brand-art” is not available to the catalog preview.']);
  });

  it("labels overflow behavior that has not been implemented faithfully", async () => {
    const detail = await syntheticCatalog().detail("visual-1");
    const version = detail.current_template_version!;
    const text = version.document.elements.find((element) => element.type === "text");
    if (!text) throw new Error("Synthetic template fixture must include text.");
    const updated = { ...detail, current_template_version: { ...version, document: { ...version.document, elements: [{ ...text, style: { ...text.style, overflow: "ellipsis" as const } }] } } };

    const preview = renderTemplatePreview(updated)!;
    expect(preview.diagnostics).toContain('Text “location-label” requests ellipsis; truncation is simplified to clipping in this preview.');
  });

  it("returns validation diagnostics for malformed template documents", async () => {
    const detail = await syntheticCatalog().detail("visual-1");
    const version = detail.current_template_version!;
    const preview = renderTemplatePreview({ ...detail, current_template_version: { ...version, document: {} as unknown as TemplateDocument } });
    expect(preview?.svg).toBe("");
    expect(preview?.diagnostics.length).toBeGreaterThan(0);
  });
});
