import { useRef, useState, type KeyboardEvent } from "react";

import { EditorHistory } from "../../../domain/editor-history";
import type { EditorCommand, ElementOrder, ResizeHandle } from "../../../domain/editor-commands";
import type { TemplateDocument } from "../../../domain/template-document";
import { Artboard } from "./Artboard";
import { Inspector } from "./Inspector";
import { LayersPanel } from "./LayersPanel";
import { ViewportControls } from "./ViewportControls";
import { defaultViewport } from "../geometry/viewport";
import "./editor.css";

export function ArtboardWorkspace({ document, versionNumber, values, onClose, onSaveDraft, saving = false }: {
  readonly document: TemplateDocument;
  readonly versionNumber: number;
  readonly values: Readonly<Record<string, string | number | boolean | null>>;
  readonly onClose: () => void;
  readonly onSaveDraft: (document: TemplateDocument) => void;
  readonly saving?: boolean;
}) {
  const [zoom, setZoom] = useState(1);
  const [editedDocument, setEditedDocument] = useState(document);
  const [selectedElementId, setSelectedElementId] = useState<string | undefined>();
  const [commandError, setCommandError] = useState<string | null>(null);
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

  return <section className="artboard-workspace" aria-labelledby="artboard-workspace-title">
    <header className="artboard-workspace-header" onKeyDown={onEditorKeyDown}>
      <div><h2 id="artboard-workspace-title">Template artboard</h2><p>Template version {versionNumber} · local edits are not saved yet; this artboard is not print-ready.</p></div>
      <div className="artboard-workspace-actions">
        <button className="button button-primary" type="button" onClick={() => onSaveDraft(editedDocument)} disabled={saving || !historyRef.current.canUndo}>{saving ? "Saving…" : "Save draft"}</button>
        <button className="button button-secondary" type="button" onClick={undo} disabled={!historyRef.current.canUndo}>Undo</button>
        <button className="button button-secondary" type="button" onClick={redo} disabled={!historyRef.current.canRedo}>Redo</button>
        <ViewportControls zoom={zoom} onZoomChange={setZoom} />
        <button className="button button-secondary" type="button" onClick={requestClose}>Return to catalog</button>
      </div>
    </header>
    {commandError ? <p className="inspector-error" role="alert">{commandError}</p> : null}
    <div className="editor-workspace-body" onKeyDown={onEditorKeyDown}>
      <div className="artboard-canvas-scroll" aria-label="Scrollable template artboard">
        <Artboard document={editedDocument} viewport={viewport} values={values} selectedElementId={selectedElementId}
          onSelectElement={setSelectedElementId}
          onNudgeElement={(elementId, dx_mm, dy_mm) => run({ type: "move_element", element_id: elementId, dx_mm, dy_mm })}
          onMoveElement={(elementId, dx_mm, dy_mm) => run({ type: "move_element", element_id: elementId, dx_mm, dy_mm })}
          onResizeElement={(elementId, handle: ResizeHandle, dx_mm, dy_mm) => run({ type: "resize_element", element_id: elementId, handle, dx_mm, dy_mm })} />
      </div>
      <div className="editor-workspace-panels">
        <LayersPanel elements={editedDocument.elements} selectedElementId={selectedElementId} onSelectElement={setSelectedElementId}
          onToggleVisibility={changeVisibility} onToggleLock={changeLock} onReorder={reorder} />
      </div>
      <Inspector element={selectedElement} page={editedDocument.page}
        onApplyGeometry={(element_id, geometry) => run({ type: "set_element_geometry", element_id, geometry })}
        onApplyPage={(geometry) => run({ type: "set_page_geometry", ...geometry })} />
    </div>
  </section>;
}
