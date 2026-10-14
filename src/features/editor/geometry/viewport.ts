import { CSS_PIXELS_PER_MILLIMETRE } from "./units";

export interface MmPoint { readonly x: number; readonly y: number }
export interface ScreenPoint { readonly x: number; readonly y: number }
export interface Viewport {
  readonly zoom: number;
  readonly pxPerMm: number;
  readonly pan: ScreenPoint;
}

function validateViewport(viewport: Viewport) {
  if (!Number.isFinite(viewport.zoom) || viewport.zoom <= 0) throw new RangeError("Viewport zoom must be finite and positive.");
  if (!Number.isFinite(viewport.pxPerMm) || viewport.pxPerMm <= 0) throw new RangeError("Viewport CSS scale must be finite and positive.");
  if (!Number.isFinite(viewport.pan.x) || !Number.isFinite(viewport.pan.y)) throw new RangeError("Viewport pan must be finite.");
}

export function viewportForZoom(viewport: Viewport, zoom: number): Viewport {
  validateViewport(viewport);
  if (!Number.isFinite(zoom) || zoom <= 0) throw new RangeError("Viewport zoom must be finite and positive.");
  return { ...viewport, zoom };
}

export function pointMmToScreen(point: MmPoint, viewport: Viewport): ScreenPoint {
  validateViewport(viewport);
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new RangeError("Millimetre coordinates must be finite.");
  const scale = viewport.pxPerMm * viewport.zoom;
  return { x: point.x * scale + viewport.pan.x, y: point.y * scale + viewport.pan.y };
}

export function screenToPointMm(point: ScreenPoint, viewport: Viewport): MmPoint {
  validateViewport(viewport);
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new RangeError("Screen coordinates must be finite.");
  const scale = viewport.pxPerMm * viewport.zoom;
  return { x: (point.x - viewport.pan.x) / scale, y: (point.y - viewport.pan.y) / scale };
}

export function screenDeltaToMillimetres(delta: ScreenPoint, viewport: Viewport): MmPoint {
  validateViewport(viewport);
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y)) throw new RangeError("Screen deltas must be finite.");
  const scale = viewport.pxPerMm * viewport.zoom;
  return { x: delta.x / scale, y: delta.y / scale };
}

export const defaultViewport = (zoom = 1, pan: ScreenPoint = { x: 0, y: 0 }): Viewport => ({
  zoom,
  pxPerMm: CSS_PIXELS_PER_MILLIMETRE,
  pan,
});
