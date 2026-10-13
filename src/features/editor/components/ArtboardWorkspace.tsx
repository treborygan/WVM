import { useRef, useState, type KeyboardEvent } from "react";

import { EditorHistory } from "../../../domain/editor-history";
import type { ExportSvgResult } from "../../../application/export-template-svg";
import type { EditorCommand, ElementOrder, ResizeHandle } from "../../../domain/editor-commands";
import type { Element, TemplateDocument } from "../../../domain/template-document";
import { Artboard } from "./Artboard";
import { GridControls } from "./GridControls";
import { Inspector } from "./Inspector";
import { LayersPanel } from "./LayersPanel";
import { ViewportControls } from "./ViewportControls";
import { defaultViewport } from "../geometry/viewport";
import "./editor.css";

export function ArtboardWorkspace({ document, versionNumber, values, onClose, onSaveDraft, onExportSvg, saving = false }: {
  readonly document: TemplateDocument;
  readonly versionNumber: number;
  readonly values: Readonly<Record<string, string | number | boolean | null>>;
  readonly onClose: () => void;
  readonly onSaveDraft: (document: TemplateDocument) => void;
  readonly onExportSvg?: (document: TemplateDocument) => Promise<ExportSvgResult>;
  readonly saving?: boolean;
}) {
  const [zoom, setZoom] = useState(1);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [snapToGuides, setSnapToGuides] = useState(true);
  const [gridStepMm, setGridStepMm] = useState(1);
  const [showGrid, setShowGrid] = useState(false);
  const [guideHint, setGuideHint] = useState<string | null>(null);
  const [editedDocument, setEditedDocument] = useState(document);
  const [selectedElementId, setSelectedElementId] = useState<string | undefined>();
  const [commandError, setCommandError] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const historyRef = useRef<EditorHistory | null>(null);
  if (!historyRef.current) historyRef.current = new EditorHistory(document);
  const viewport = defaultViewport(zoom);
  const selectedElement = editedDocument.elements.find((element) => element.id === selectedElementId);

  function run(command: EditorCommand) {
    try {
      const next = historyRef.current!.apply(command);
      setEditedDocument(next);
      setCommandError(null);
    } catch (reason) {
      setCommandError(reason instanceof Error ? reason.message : "The edit could not be applied.");
    }
  }

  function undo() {
    const next = historyRef.current!.undo();
    if (next) { setEditedDocument(next); setCommandError(null); }
  }

  function redo() {
    const next = historyRef.current!.redo();
    if (next) { setEditedDocument(next); setCommandError(null); }
  }

  function requestClose() {
    if (historyRef.current!.canUndo && !window.confirm("Discard unsaved artboard edits and return to the catalog?")) return;
    onClose();
  }

  async function exportSvg() {
    if (!onExportSvg) return;
    setExportNotice("Preparing SVG…");
    try {
      const result = await onExportSvg(editedDocument);
      if (result.status === "cancelled") { setExportNotice(null); return; }
      if (result.status === "invalid") { setExportNotice(`SVG was not saved: ${result.diagnostics[0] ?? "The document is invalid."}`); return; }
      const warning = result.diagnostics.length ? ` Preview note: ${result.diagnostics[0]}` : "";
      setExportNotice(`SVG saved to ${result.path}.${warning}`);
    } catch (reason) {
      setExportNotice(`SVG export failed: ${reason instanceof Error ? reason.message : "The file could not be written."}`);
    }
  }

  function onEditorKeyDown(event: KeyboardEvent<HTMLElement>) {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable=true]")) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault(); redo();
    }
  }

  function changeVisibility(id: string, visible: boolean) { run({ type: "set_element_visible", element_id: id, visible }); }
  function changeLock(id: string, locked: boolean) { run({ type: "set_element_locked", element_id: id, locked }); }
  function reorder(id: string, position: ElementOrder) { run({ type: "reorder_element", element_id: id, position }); }

  function addElement(type: "text" | "rectangle" | "line") {
    const id = `${type}-${crypto.randomUUID()}`;
    const offset = 10 + (editedDocument.elements.length % 12) * 4;
    const base = { id, x_mm: offset, y_mm: offset, width_mm: type === "rectangle" ? 45 : 80, height_mm: type === "line" ? 1 : type === "rectangle" ? 30 : 18, rotation_degrees: 0, z_index: 0, visible: true, locked: false };
    const color = type === "text" ? editedDocument.defaults.text_color ?? "#000000" : type === "rectangle" ? editedDocument.defaults.fill_color ?? "#ffffff" : "#000000";
    const element: Element = type === "text" ? {
      ...base, type, content: { kind: "literal", value: "New text" },
      style: { font_family: editedDocument.defaults.font_family ?? "Arial", font_size_pt: 18, font_weight: "bold", font_style: "normal", horizontal_align: "left", vertical_align: "middle", line_height: 1, wrapping: "nowrap", overflow: "clip", fit_policy: "none", color: { kind: "literal", value: color } },
    } : type === "rectangle" ? {
      ...base, type, style: { fill: { kind: "literal", value: color }, stroke: null, stroke_width_mm: 0 },
    } : { ...base, type, style: { stroke: { kind: "literal", value: color }, stroke_width_mm: 0.4 } };
    run({ type: "add_element", element });
    setSelectedElementId(id);
  }

  function deleteElement(id: string) {
    run({ type: "remove_element", element_id: id });
    setSelectedElementId(undefined);
  }

  return <section className="artboard-workspace" aria-labelledby="artboard-workspace-title">
    <header className="artboard-workspace-header" onKeyDown={onEditorKeyDown}>
      <div><h2 id="artboard-workspace-title">Template artboard</h2><p>Template version {versionNumber} · local edits are not saved yet; this artboard is not print-ready.</p></div>
      <div className="artboard-workspace-actions">
        <button className="button button-primary" type="button" onClick={() => onSaveDraft(editedDocument)} disabled={saving || !historyRef.current.canUndo}>{saving ? "Saving…" : "Save draft"}</button>
        <button className="button button-secondary" type="button" onClick={() => void exportSvg()} disabled={saving || !onExportSvg}>Export SVG</button>
        <button className="button button-secondary" type="button" onClick={undo} disabled={!historyRef.current.canUndo}>Undo</button>
        <button className="button button-secondary" type="button" onClick={redo} disabled={!historyRef.current.canRedo}>Redo</button>
        <ViewportControls zoom={zoom} onZoomChange={setZoom} />
        <GridControls snapToGrid={snapToGrid} snapToGuides={snapToGuides} gridStepMm={gridStepMm} showGrid={showGrid} onSnapChange={setSnapToGrid} onGuidesChange={setSnapToGuides} onStepChange={setGridStepMm} onShowChange={setShowGrid} />
        <output className="guide-hint" role="status" aria-live="polite">{guideHint ?? ""}</output>
        <button className="button button-secondary" type="button" onClick={requestClose}>Return to catalog</button>
      </div>
    </header>
    {exportNotice ? <p className={exportNotice.startsWith("SVG export failed") || exportNotice.startsWith("SVG was not saved") ? "inspector-error" : "status-line"} role="status" aria-live="polite">{exportNotice}</p> : null}
    {commandError ? <p className="inspector-error" role="alert">{commandError}</p> : null}
    <div className="editor-workspace-body" onKeyDown={onEditorKeyDown}>
      <div className="artboard-canvas-scroll" aria-label="Scrollable template artboard">
        <Artboard document={editedDocument} viewport={viewport} values={values} selectedElementId={selectedElementId} snapToGrid={snapToGrid} snapToGuides={snapToGuides} gridStepMm={gridStepMm} showGrid={showGrid} onGuideHint={setGuideHint}
          onSelectElement={setSelectedElementId}
          onNudgeElement={(elementId, dx_mm, dy_mm) => run({ type: "move_element", element_id: elementId, dx_mm, dy_mm })}
          onMoveElement={(elementId, dx_mm, dy_mm) => run({ type: "move_element", element_id: elementId, dx_mm, dy_mm })}
          onResizeElement={(elementId, handle: ResizeHandle, dx_mm, dy_mm) => run({ type: "resize_element", element_id: elementId, handle, dx_mm, dy_mm })} />
      </div>
      <div className="editor-workspace-panels">
        <LayersPanel elements={editedDocument.elements} selectedElementId={selectedElementId} onSelectElement={setSelectedElementId}
          onToggleVisibility={changeVisibility} onToggleLock={changeLock} onReorder={reorder} onAddElement={addElement} onDeleteElement={deleteElement} />
      </div>
      <Inspector element={selectedElement} page={editedDocument.page} values={values}
        onApplyGeometry={(element_id, geometry) => run({ type: "set_element_geometry", element_id, geometry })}
        onApplyPage={(geometry) => run({ type: "set_page_geometry", ...geometry })}
        onApplyTextAuthoring={(element_id, authoring) => run({ type: "set_text_authoring", element_id, ...authoring })}
        onApplyShapeFill={(element_id, color) => run({ type: "set_shape_fill", element_id, color })} />
    </div>
  </section>;
}
