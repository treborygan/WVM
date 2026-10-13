import type { ResizeHandle } from "../../../domain/editor-commands";

export interface GridDelta {
  readonly dx_mm: number;
  readonly dy_mm: number;
}

function validateStep(stepMm: number): void {
  if (!Number.isFinite(stepMm) || stepMm <= 0) throw new RangeError("Grid step must be a finite positive number of millimetres.");
}

export function snapToGrid(positionMm: number, stepMm: number): number {
  validateStep(stepMm);
  if (!Number.isFinite(positionMm)) throw new RangeError("Grid position must be finite.");
  return Math.round(positionMm / stepMm) * stepMm;
}

export function snapMoveDeltas(position: { readonly x_mm: number; readonly y_mm: number }, delta: GridDelta, stepMm: number): GridDelta {
  return {
    dx_mm: snapToGrid(position.x_mm + delta.dx_mm, stepMm) - position.x_mm,
    dy_mm: snapToGrid(position.y_mm + delta.dy_mm, stepMm) - position.y_mm,
  };
}

export function snapResizeDeltas(
  geometry: { readonly x_mm: number; readonly y_mm: number; readonly width_mm: number; readonly height_mm: number },
  handle: ResizeHandle,
  delta: GridDelta,
  stepMm: number,
): GridDelta {
  return {
    dx_mm: handle.includes("w")
      ? snapToGrid(geometry.x_mm + delta.dx_mm, stepMm) - geometry.x_mm
      : handle.includes("e")
        ? snapToGrid(geometry.x_mm + geometry.width_mm + delta.dx_mm, stepMm) - (geometry.x_mm + geometry.width_mm)
        : 0,
    dy_mm: handle.includes("n")
      ? snapToGrid(geometry.y_mm + delta.dy_mm, stepMm) - geometry.y_mm
      : handle.includes("s")
        ? snapToGrid(geometry.y_mm + geometry.height_mm + delta.dy_mm, stepMm) - (geometry.y_mm + geometry.height_mm)
        : 0,
  };
}
