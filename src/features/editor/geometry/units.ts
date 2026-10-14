export const MILLIMETRES_PER_INCH = 25.4;
export const POINTS_PER_INCH = 72;
export const CSS_PIXELS_PER_INCH = 96;
export const CSS_PIXELS_PER_MILLIMETRE = CSS_PIXELS_PER_INCH / MILLIMETRES_PER_INCH;

export function pointsToMillimetres(points: number): number {
  if (!Number.isFinite(points)) throw new RangeError("Point size must be finite.");
  return points * MILLIMETRES_PER_INCH / POINTS_PER_INCH;
}
