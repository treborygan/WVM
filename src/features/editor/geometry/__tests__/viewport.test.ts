import { describe, expect, it } from "vitest";

import { pointMmToScreen, screenDeltaToMillimetres, screenToPointMm, viewportForZoom, type Viewport } from "../viewport";
import { pointsToMillimetres } from "../units";

describe("physical viewport geometry", () => {
  const viewport: Viewport = { zoom: 1, pxPerMm: 96 / 25.4, pan: { x: 13, y: -7 } };

  it("round-trips millimetres through the screen transform", () => {
    const input = { x: 37.25, y: 118.5 };
    const screen = pointMmToScreen(input, viewport);
    expect(screenToPointMm(screen, viewport).x).toBeCloseTo(input.x, 10);
    expect(screenToPointMm(screen, viewport).y).toBeCloseTo(input.y, 10);
  });

  it("converts font points into physical millimetres", () => {
    expect(pointsToMillimetres(72)).toBeCloseTo(25.4, 12);
    expect(pointsToMillimetres(12)).toBeCloseTo(4.233333333333333, 12);
  });

  it.each([0.25, 1, 4])("maps an intended 8 mm drag back to 8 mm at zoom %s", (zoom) => {
    const scaled = viewportForZoom(viewport, zoom);
    const start = pointMmToScreen({ x: 30, y: 40 }, scaled);
    const end = pointMmToScreen({ x: 38, y: 40 }, scaled);
    const deltaMm = screenDeltaToMillimetres({ x: end.x - start.x, y: end.y - start.y }, scaled);
    expect(deltaMm.x).toBeCloseTo(8, 10);
    expect(deltaMm.y).toBeCloseTo(0, 10);
  });
});
