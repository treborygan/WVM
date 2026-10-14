import { describe, expect, it } from "vitest";

import { getElementBounds, isInsidePage } from "../bounds";

describe("element physical bounds", () => {
  it("returns the exact unrotated bounds", () => {
    expect(getElementBounds({ x_mm: 10, y_mm: 20, width_mm: 40, height_mm: 12, rotation_degrees: 0 }))
      .toEqual({ x_mm: 10, y_mm: 20, width_mm: 40, height_mm: 12 });
  });

  it("computes a rotated axis-aligned bound around the element centre", () => {
    expect(getElementBounds({ x_mm: 10, y_mm: 20, width_mm: 40, height_mm: 12, rotation_degrees: 90 }))
      .toEqual({ x_mm: 24, y_mm: 6, width_mm: 12, height_mm: 40 });
  });

  it("detects page overflow while allowing geometry edits to remain visible", () => {
    expect(isInsidePage({ x_mm: 10, y_mm: 10, width_mm: 20, height_mm: 20, rotation_degrees: 0 }, { width_mm: 210, height_mm: 297 })).toBe(true);
    expect(isInsidePage({ x_mm: 200, y_mm: 10, width_mm: 20, height_mm: 20, rotation_degrees: 0 }, { width_mm: 210, height_mm: 297 })).toBe(false);
  });
});
