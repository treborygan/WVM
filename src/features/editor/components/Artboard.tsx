import { useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";

import { applyEditorCommand, type ResizeHandle } from "../../../domain/editor-commands";
import type { Element, TemplateDocument } from "../../../domain/template-document";
import { isInsidePage } from "../geometry/bounds";
import { snapMoveDeltas, snapResizeDeltas } from "../geometry/grid";
import { snapMoveToGuides, snapResizeToGuides, type GuideSnapResult } from "../geometry/guides";
import { pointsToMillimetres } from "../geometry/units";
import { screenDeltaToMillimetres, type Viewport } from "../geometry/viewport";
import "./editor.css";

export interface ArtboardProps {
  readonly document: TemplateDocument;
  readonly viewport: Viewport;
  readonly values?: Readonly<Record<string, string | number | boolean | null>>;
  readonly selectedElementId?: string;
  readonly onSelectElement?: (elementId: string) => void;
  readonly onNudgeElement?: (elementId: string, dxMm: number, dyMm: number) => void;
  readonly onMoveElement?: (elementId: string, dxMm: number, dyMm: number) => void;
  readonly onResizeElement?: (elementId: string, handle: ResizeHandle, dxMm: number, dyMm: number) => void;
  readonly snapToGrid?: boolean;
  readonly snapToGuides?: boolean;
  readonly gridStepMm?: number;
  readonly guideTolerancePx?: number;
  readonly onGuideHint?: (hint: string | null) => void;
  readonly showGrid?: boolean;
}

interface PointerGesture {
  readonly elementId: string;
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly handle?: ResizeHandle;
}

function resolveText(element: Extract<Element, { type: "text" }>, values: ArtboardProps["values"]): string {
  if (element.content.kind === "literal") return element.content.value;
  const value = values?.[element.content.path];
  return value === null || value === undefined ? `[${element.content.path}]` : String(value);
}

function resolveColor(binding: { readonly kind: "literal"; readonly value: string } | { readonly kind: "binding"; readonly path: string }, values: ArtboardProps["values"]): string {
  if (binding.kind === "literal") return binding.value;
  const value = values?.[binding.path];
  return typeof value === "string" ? value : `var(${binding.path.replaceAll(".", "-")}, #666)`;
}

function transform(element: Element): string | undefined {
  if (element.rotation_degrees === 0) return undefined;
  return `rotate(${element.rotation_degrees} ${element.x_mm + element.width_mm / 2} ${element.y_mm + element.height_mm / 2})`;
}

function label(element: Element, values?: ArtboardProps["values"]): string {
  if (element.type === "text") return `Select text: ${resolveText(element, values)}`;
  if (element.type === "image") return `Select image: ${element.source.kind === "asset" ? element.source.asset_id : element.source.path}`;
  return `Select ${element.type}: ${element.id}`;
}

function onKeySelect(event: KeyboardEvent<SVGGElement>, id: string, props: ArtboardProps) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    props.onSelectElement?.(id);
  } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
    event.preventDefault();
    const step = event.shiftKey ? 10 : event.altKey ? props.gridStepMm ?? 1 : 1;
    const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    props.onNudgeElement?.(id, dx, dy);
  }
}

function onKeyResize(event: KeyboardEvent<SVGCircleElement>, id: string, handle: ResizeHandle, props: ArtboardProps) {
  const step = event.shiftKey ? 10 : event.altKey ? props.gridStepMm ?? 1 : 1;
  const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
  const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
  if (dx === 0 && dy === 0) return;
  event.preventDefault();
  event.stopPropagation();
  props.onSelectElement?.(id);
  if ((dx === 0 || handle.includes("w") || handle.includes("e")) && (dy === 0 || handle.includes("n") || handle.includes("s"))) {
    props.onResizeElement?.(id, handle, dx, dy);
  }
}

function renderElement(element: Element, props: ArtboardProps, pointerHandlers: {
  readonly onPointerDown: (event: PointerEvent<SVGGElement>) => void;
  readonly onPointerMove: (event: PointerEvent<SVGGElement>) => void;
  readonly onPointerUp: (event: PointerEvent<SVGGElement>) => void;
  readonly onPointerCancel: () => void;
}) {
  if (!element.visible) return null;
  const selected = props.selectedElementId === element.id;
  const outOfPage = !isInsidePage(element, props.document.page);
  const common = {
    className: `artboard-element${selected ? " is-selected" : ""}${outOfPage ? " is-out-of-page" : ""}${element.locked ? " is-locked" : ""}`,
    transform: transform(element),
    role: "button" as const,
    tabIndex: element.locked ? -1 : 0,
    "aria-label": label(element, props.values),
    "aria-pressed": selected,
    "aria-disabled": element.locked,
    "data-element-id": element.id,
    "data-out-of-page": outOfPage ? "true" : undefined,
    onFocus: () => { if (!element.locked) props.onSelectElement?.(element.id); },
    onClick: (event: MouseEvent<SVGGElement>) => { event.stopPropagation(); if (!element.locked) props.onSelectElement?.(element.id); },
    onKeyDown: (event: KeyboardEvent<SVGGElement>) => { if (!element.locked) onKeySelect(event, element.id, props); },
    onPointerDown: pointerHandlers.onPointerDown,
    onPointerMove: pointerHandlers.onPointerMove,
    onPointerUp: pointerHandlers.onPointerUp,
    onPointerCancel: pointerHandlers.onPointerCancel,
  };
  const x = element.x_mm;
  const y = element.y_mm;
  const width = element.width_mm;
  const height = element.height_mm;
  const resizeHandleRadiusMm = 12 / (props.viewport.pxPerMm * props.viewport.zoom);
  let artwork;
  if (element.type === "text") {
    const textAnchor = element.style.horizontal_align === "center" ? "middle" : element.style.horizontal_align === "right" ? "end" : "start";
    const textX = element.style.horizontal_align === "center" ? x + width / 2 : element.style.horizontal_align === "right" ? x + width : x;
    const textY = element.style.vertical_align === "top" ? y + pointsToMillimetres(element.style.font_size_pt) : element.style.vertical_align === "bottom" ? y + height : y + height / 2;
    const fontWeight = element.style.font_weight === "normal" ? 400 : element.style.font_weight === "bold" ? 700 : element.style.font_weight;
    artwork = <><defs><clipPath id={`artboard-clip-${element.id}`}><rect x={x} y={y} width={width} height={height} /></clipPath></defs><g clipPath={`url(#artboard-clip-${element.id})`}><text x={textX} y={textY} textAnchor={textAnchor} dominantBaseline="middle" fontFamily={element.style.font_family} fontSize={pointsToMillimetres(element.style.font_size_pt)} fontWeight={fontWeight} fontStyle={element.style.font_style} fill={resolveColor(element.style.color, props.values)}>{resolveText(element, props.values)}</text></g></>;
  } else if (element.type === "rectangle" || element.type === "band" || element.type === "background") {
    artwork = <rect x={x} y={y} width={width} height={height} fill={resolveColor(element.style.fill, props.values)} stroke={element.style.stroke ? resolveColor(element.style.stroke, props.values) : "none"} strokeWidth={element.style.stroke_width_mm} />;
  } else if (element.type === "line" || element.type === "border") {
    artwork = <line x1={x} y1={y} x2={x + width} y2={y + height} stroke={resolveColor(element.style.stroke, props.values)} strokeWidth={element.style.stroke_width_mm} />;
  } else if (element.type === "image") {
    const source = element.source.kind === "asset" ? element.source.asset_id : element.source.path;
    artwork = <g><rect x={x} y={y} width={width} height={height} fill="#f1f2f3" stroke="#777" strokeDasharray="2 1" /><text x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="middle" fontSize={3}>Image: {source}</text></g>;
  } else {
    return null;
  }
  const handles: readonly [ResizeHandle, number, number][] = [
    ["nw", x, y], ["n", x + width / 2, y], ["ne", x + width, y], ["e", x + width, y + height / 2],
    ["se", x + width, y + height], ["s", x + width / 2, y + height], ["sw", x, y + height], ["w", x, y + height / 2],
  ];
  return <g key={element.id} {...common}>
    {artwork}
    {selected ? <rect className="artboard-selection-outline" x={x} y={y} width={width} height={height} /> : null}
    {selected && !element.locked ? <g className="artboard-resize-handles" aria-label={`Resize handles for ${element.id}`}>
      {handles.map(([handle, cx, cy]) => <circle key={handle} className={`resize-handle resize-${handle}`} data-resize-handle={handle} role="button" tabIndex={0} aria-label={`Resize ${element.id} ${handle}; use arrow keys, Shift+Arrow for 10 mm`} onKeyDown={(event) => onKeyResize(event, element.id, handle, props)} cx={cx} cy={cy} r={resizeHandleRadiusMm} />)}
    </g> : null}
  </g>;
}

export function Artboard(props: ArtboardProps) {
  const gestureRef = useRef<PointerGesture | null>(null);
  const [previewDocument, setPreviewDocument] = useState<TemplateDocument | null>(null);
  const gestureDocument = previewDocument ?? props.document;
  const [activeGuides, setActiveGuides] = useState<GuideSnapResult>({ delta: { dx_mm: 0, dy_mm: 0 } });
  const { width_mm, height_mm } = props.document.page;
  const { zoom, pxPerMm, pan } = props.viewport;
  const width = width_mm * pxPerMm * zoom;
  const height = height_mm * pxPerMm * zoom;
  const elements = [...gestureDocument.elements].sort((a, b) => a.z_index - b.z_index || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  function commandFor(gesture: PointerGesture, clientX: number, clientY: number) {
    const physicalDelta = screenDeltaToMillimetres({ x: clientX - gesture.startX, y: clientY - gesture.startY }, props.viewport);
    let delta = { dx_mm: physicalDelta.x, dy_mm: physicalDelta.y };
    let guides: GuideSnapResult = { delta };
    if (props.snapToGrid && (delta.dx_mm !== 0 || delta.dy_mm !== 0)) {
      const element = props.document.elements.find((item) => item.id === gesture.elementId);
      if (element) delta = gesture.handle
        ? snapResizeDeltas(element, gesture.handle, delta, props.gridStepMm ?? 1)
        : snapMoveDeltas(element, delta, props.gridStepMm ?? 1);
    }
    if (props.snapToGuides && (delta.dx_mm !== 0 || delta.dy_mm !== 0)) {
      const toleranceMm = (props.guideTolerancePx ?? 3) / (props.viewport.pxPerMm * props.viewport.zoom);
      guides = gesture.handle
        ? snapResizeToGuides(props.document, gesture.elementId, gesture.handle, delta, toleranceMm)
        : snapMoveToGuides(props.document, gesture.elementId, delta, toleranceMm);
      delta = guides.delta;
    }
    const command = gesture.handle
      ? { type: "resize_element" as const, element_id: gesture.elementId, handle: gesture.handle, dx_mm: delta.dx_mm, dy_mm: delta.dy_mm, minimum_mm: 1 }
      : { type: "move_element" as const, element_id: gesture.elementId, dx_mm: delta.dx_mm, dy_mm: delta.dy_mm };
    return { command, guides };
  }
  function beginGesture(event: PointerEvent<SVGGElement>) {
    const source = event.target;
    const handle = source instanceof SVGElement ? source.getAttribute("data-resize-handle") as ResizeHandle | null : null;
    const elementId = event.currentTarget.getAttribute("data-element-id");
    if (!elementId || event.button !== 0 || event.currentTarget.getAttribute("aria-disabled") === "true") return;
    event.preventDefault();
    props.onSelectElement?.(elementId);
    gestureRef.current = { elementId, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, ...(handle ? { handle } : {}) };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Pointer capture may be unavailable in test or embedded hosts. */ }
  }
  function moveGesture(event: PointerEvent<SVGGElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const result = commandFor(gesture, event.clientX, event.clientY);
    setActiveGuides(result.guides);
    const targets = [result.guides.xGuide?.target, result.guides.yGuide?.target].filter((target): target is string => Boolean(target));
    props.onGuideHint?.(targets.length ? `Aligned to ${targets.join(" and ")}` : null);
    try { setPreviewDocument(applyEditorCommand(props.document, result.command)); }
    catch { /* Invalid transient resize remains at its last valid preview geometry. */ }
  }
  function finishGesture(event: PointerEvent<SVGGElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const { command } = commandFor(gesture, event.clientX, event.clientY);
    if (command.dx_mm !== 0 || command.dy_mm !== 0) {
      if (gesture.handle) props.onResizeElement?.(gesture.elementId, gesture.handle, command.dx_mm, command.dy_mm);
      else props.onMoveElement?.(gesture.elementId, command.dx_mm, command.dy_mm);
    }
    gestureRef.current = null;
    setPreviewDocument(null);
    setActiveGuides({ delta: { dx_mm: 0, dy_mm: 0 } });
    props.onGuideHint?.(null);
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* Capture may already have been released by the platform. */ }
  }
  const pointerHandlers = {
    onPointerDown: beginGesture,
    onPointerMove: moveGesture,
    onPointerUp: finishGesture,
    onPointerCancel: () => { gestureRef.current = null; setPreviewDocument(null); setActiveGuides({ delta: { dx_mm: 0, dy_mm: 0 } }); props.onGuideHint?.(null); },
  };
  return <svg className="editor-artboard" role="group" aria-label="Template artboard" width={width} height={height} viewBox={`0 0 ${width_mm} ${height_mm}`} style={{ transform: `translate(${pan.x}px, ${pan.y}px)`, transformOrigin: "top left" }}>
    {props.showGrid ? <defs><pattern id="artboard-grid-pattern" width={props.gridStepMm ?? 1} height={props.gridStepMm ?? 1} patternUnits="userSpaceOnUse"><path d={`M ${props.gridStepMm ?? 1} 0 H 0 V ${props.gridStepMm ?? 1}`} fill="none" stroke="#b6c2cc" strokeWidth="0.18" /></pattern></defs> : null}
    <rect className="artboard-page" x={0} y={0} width={width_mm} height={height_mm} />
    {props.showGrid ? <rect className="artboard-grid" x={0} y={0} width={width_mm} height={height_mm} fill="url(#artboard-grid-pattern)" pointerEvents="none" /> : null}
    {elements.map((element) => renderElement(element, { ...props, document: gestureDocument }, pointerHandlers))}
    {activeGuides.xGuide ? <line className="artboard-alignment-guide" data-testid="alignment-guide-x" x1={activeGuides.xGuide.position_mm} x2={activeGuides.xGuide.position_mm} y1={0} y2={height_mm}><title>Aligned to {activeGuides.xGuide.target}</title></line> : null}
    {activeGuides.yGuide ? <line className="artboard-alignment-guide" data-testid="alignment-guide-y" x1={0} x2={width_mm} y1={activeGuides.yGuide.position_mm} y2={activeGuides.yGuide.position_mm}><title>Aligned to {activeGuides.yGuide.target}</title></line> : null}
  </svg>;
}
