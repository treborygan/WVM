import { describe, expect, it } from "vitest";

import { snapMoveDeltas, snapResizeDeltas, snapToGrid } from "../grid";

describe("editor grid snapping", () => {
  it("snaps positive and negative physical positions to the nearest step", () => {
    expect(snapToGrid(12.6, 5)).toBe(15);
    expect(snapToGrid(-12.6, 5)).toBe(-15);
  });

  it("moves an element to the nearest grid position from its current geometry", () => {
    expect(snapMoveDeltas({ x_mm: 12, y_mm: 18 }, { dx_mm: 4, dy_mm: -5 }, 5)).toEqual({ dx_mm: 3, dy_mm: -3 });
  });

  it("snaps only the edges controlled by a resize handle", () => {
    const element = { x_mm: 12, y_mm: 18, width_mm: 31, height_mm: 22 };
    expect(snapResizeDeltas(element, "e", { dx_mm: 4, dy_mm: 9 }, 5)).toEqual({ dx_mm: 2, dy_mm: 0 });
    expect(snapResizeDeltas(element, "nw", { dx_mm: -4, dy_mm: 4 }, 5)).toEqual({ dx_mm: -2, dy_mm: 2 });
  });

  it("rejects non-positive grid steps and non-finite positions", () => {
    expect(() => snapToGrid(Number.NaN, 1)).toThrow(RangeError);
    expect(() => snapToGrid(1, 0)).toThrow(RangeError);
  });
});
