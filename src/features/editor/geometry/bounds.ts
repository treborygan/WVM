import type { ElementGeometry, PageGeometry } from "../../../domain/template-document";

export interface BoundsMm { readonly x_mm: number; readonly y_mm: number; readonly width_mm: number; readonly height_mm: number }

function clean(value: number): number {
  const rounded = Math.round(value * 1e12) / 1e12;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function getElementBounds(element: ElementGeometry): BoundsMm {
  const { x_mm, y_mm, width_mm, height_mm, rotation_degrees } = element;
  if (![x_mm, y_mm, width_mm, height_mm, rotation_degrees].every(Number.isFinite) || width_mm <= 0 || height_mm <= 0) {
    throw new RangeError("Element geometry must be finite with positive dimensions.");
  }
  if (rotation_degrees % 360 === 0) return { x_mm, y_mm, width_mm, height_mm };

  const centerX = x_mm + width_mm / 2;
  const centerY = y_mm + height_mm / 2;
  const radians = rotation_degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const corners = [
    [x_mm, y_mm], [x_mm + width_mm, y_mm],
    [x_mm + width_mm, y_mm + height_mm], [x_mm, y_mm + height_mm],
  ].map(([x, y]) => {
    const dx = x! - centerX;
    const dy = y! - centerY;
    return { x: centerX + dx * cos - dy * sin, y: centerY + dx * sin + dy * cos };
  });
  const minX = Math.min(...corners.map(({ x }) => x));
  const minY = Math.min(...corners.map(({ y }) => y));
  const maxX = Math.max(...corners.map(({ x }) => x));
  const maxY = Math.max(...corners.map(({ y }) => y));
  return { x_mm: clean(minX), y_mm: clean(minY), width_mm: clean(maxX - minX), height_mm: clean(maxY - minY) };
}

export function isInsidePage(element: ElementGeometry, page: Pick<PageGeometry, "width_mm" | "height_mm">, toleranceMm = 1e-9): boolean {
  if (!Number.isFinite(page.width_mm) || !Number.isFinite(page.height_mm) || page.width_mm <= 0 || page.height_mm <= 0 || !Number.isFinite(toleranceMm) || toleranceMm < 0) {
    throw new RangeError("Page dimensions and bounds tolerance must be finite and positive.");
  }
  const bounds = getElementBounds(element);
  return bounds.x_mm >= -toleranceMm && bounds.y_mm >= -toleranceMm
    && bounds.x_mm + bounds.width_mm <= page.width_mm + toleranceMm
    && bounds.y_mm + bounds.height_mm <= page.height_mm + toleranceMm;
}
