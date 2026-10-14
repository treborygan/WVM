import type { ResizeHandle } from "../../../domain/editor-commands";
import type { Element, TemplateDocument } from "../../../domain/template-document";
import type { GridDelta } from "./grid";

export interface AlignmentGuide {
  readonly position_mm: number;
  readonly target: string;
}

export interface GuideSnapResult {
  readonly delta: GridDelta;
  readonly xGuide?: AlignmentGuide;
  readonly yGuide?: AlignmentGuide;
}

interface AxisFeature {
  readonly position: number;
  readonly target: string;
}

function elementFeatures(elements: readonly Element[], axis: "x" | "y"): AxisFeature[] {
  return elements.flatMap((element) => {
    const start = axis === "x" ? element.x_mm : element.y_mm;
    const size = axis === "x" ? element.width_mm : element.height_mm;
    const edgeStart = axis === "x" ? "left" : "top";
    const edgeEnd = axis === "x" ? "right" : "bottom";
    return [
      { position: start, target: `${element.id} ${edgeStart} edge` },
      { position: start + size / 2, target: `${element.id} center` },
      { position: start + size, target: `${element.id} ${edgeEnd} edge` },
    ];
  });
}

function pageFeatures(document: TemplateDocument, axis: "x" | "y"): AxisFeature[] {
  const size = axis === "x" ? document.page.width_mm : document.page.height_mm;
  const edgeStart = axis === "x" ? "left" : "top";
  const edgeEnd = axis === "x" ? "right" : "bottom";
  return [
    { position: 0, target: `page ${edgeStart} edge` },
    { position: size / 2, target: "page center" },
    { position: size, target: `page ${edgeEnd} edge` },
  ];
}

function snapAxis(subjectPositions: readonly number[], delta: number, targets: readonly AxisFeature[], toleranceMm: number): { readonly delta: number; readonly guide?: AlignmentGuide } {
  const candidates = subjectPositions.flatMap((position) => targets.map((target) => ({
    correction: target.position - (position + delta),
    position: target.position,
    target: target.target,
  }))).filter((candidate) => Math.abs(candidate.correction) <= toleranceMm)
    .sort((a, b) => Math.abs(a.correction) - Math.abs(b.correction) || a.position - b.position || a.target.localeCompare(b.target));
  const closest = candidates[0];
  return closest ? { delta: delta + closest.correction, guide: { position_mm: closest.position, target: closest.target } } : { delta };
}

function eligibleTargets(document: TemplateDocument, selectedId: string): readonly Element[] {
  return document.elements.filter((element) => element.id !== selectedId && element.visible && !element.locked);
}

function validateTolerance(toleranceMm: number): void {
  if (!Number.isFinite(toleranceMm) || toleranceMm < 0) throw new RangeError("Guide tolerance must be a finite non-negative number of millimetres.");
}

export function snapMoveToGuides(document: TemplateDocument, elementId: string, delta: GridDelta, toleranceMm: number): GuideSnapResult {
  validateTolerance(toleranceMm);
  const element = document.elements.find((item) => item.id === elementId);
  if (!element) return { delta };
  const targets = [...pageFeatures(document, "x"), ...elementFeatures(eligibleTargets(document, elementId), "x")];
  const yTargets = [...pageFeatures(document, "y"), ...elementFeatures(eligibleTargets(document, elementId), "y")];
  const x = snapAxis([element.x_mm, element.x_mm + element.width_mm / 2, element.x_mm + element.width_mm], delta.dx_mm, targets, toleranceMm);
  const y = snapAxis([element.y_mm, element.y_mm + element.height_mm / 2, element.y_mm + element.height_mm], delta.dy_mm, yTargets, toleranceMm);
  return { delta: { dx_mm: x.delta, dy_mm: y.delta }, ...(x.guide ? { xGuide: x.guide } : {}), ...(y.guide ? { yGuide: y.guide } : {}) };
}

export function snapResizeToGuides(document: TemplateDocument, elementId: string, handle: ResizeHandle, delta: GridDelta, toleranceMm: number): GuideSnapResult {
  validateTolerance(toleranceMm);
  const element = document.elements.find((item) => item.id === elementId);
  if (!element) return { delta };
  const targets = [...pageFeatures(document, "x"), ...elementFeatures(eligibleTargets(document, elementId), "x")];
  const yTargets = [...pageFeatures(document, "y"), ...elementFeatures(eligibleTargets(document, elementId), "y")];
  const xPositions = handle.includes("w") ? [element.x_mm] : handle.includes("e") ? [element.x_mm + element.width_mm] : [];
  const yPositions = handle.includes("n") ? [element.y_mm] : handle.includes("s") ? [element.y_mm + element.height_mm] : [];
  const x = snapAxis(xPositions, delta.dx_mm, targets, toleranceMm);
  const y = snapAxis(yPositions, delta.dy_mm, yTargets, toleranceMm);
  return { delta: { dx_mm: xPositions.length ? x.delta : 0, dy_mm: yPositions.length ? y.delta : 0 }, ...(x.guide ? { xGuide: x.guide } : {}), ...(y.guide ? { yGuide: y.guide } : {}) };
}
