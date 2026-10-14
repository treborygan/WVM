import type { Element } from "../../../domain/template-document";
import type { ElementOrder } from "../../../domain/editor-commands";
import "./editor.css";

export function LayersPanel({ elements, selectedElementId, onSelectElement, onToggleVisibility, onToggleLock, onReorder, onAddElement, onImportImage, onDeleteElement }: {
  readonly elements: readonly Element[];
  readonly selectedElementId?: string;
  readonly onSelectElement: (id: string) => void;
  readonly onToggleVisibility: (id: string, visible: boolean) => void;
  readonly onToggleLock: (id: string, locked: boolean) => void;
  readonly onReorder: (id: string, position: ElementOrder) => void;
  readonly onAddElement: (type: "text" | "rectangle" | "line") => void;
  readonly onImportImage?: () => void;
  readonly onDeleteElement: (id: string) => void;
}) {
  const ordered = [...elements].sort((a, b) => b.z_index - a.z_index || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  const selectedElement = elements.find((element) => element.id === selectedElementId);
  return <section className="layers-panel" aria-label="Layers">
    <h3>Layers</h3>
    <div className="element-actions">
      <button type="button" onClick={() => onAddElement("text")}>Add text</button>
      <button type="button" onClick={() => onAddElement("rectangle")}>Add rectangle</button>
      <button type="button" onClick={() => onAddElement("line")}>Add line</button>
      <button type="button" onClick={onImportImage} disabled={!onImportImage}>Add image</button>
      <button type="button" onClick={() => selectedElement && onDeleteElement(selectedElement.id)} disabled={!selectedElement || selectedElement.locked}>Delete selected element</button>
    </div>
    <p className="layers-help">Import PNG or JPEG images up to 20 MiB. SVG import is not supported yet.</p>
    {ordered.length ? <ol>
      {ordered.map((element) => <li key={element.id} className={selectedElementId === element.id ? "is-selected" : ""}>
        <button className="layer-select" type="button" onClick={() => onSelectElement(element.id)} aria-label={`Select layer ${element.id}`} aria-current={selectedElementId === element.id ? "true" : undefined}>
          <span>{element.type}</span><strong>{element.id}</strong>
        </button>
        <div className="layer-actions">
          <button type="button" aria-label={`${element.visible ? "Hide" : "Show"} ${element.id}`} aria-pressed={!element.visible} onClick={() => onToggleVisibility(element.id, !element.visible)}>{element.visible ? "Hide" : "Show"}</button>
          <button type="button" aria-label={`${element.locked ? "Unlock" : "Lock"} ${element.id}`} aria-pressed={element.locked} onClick={() => onToggleLock(element.id, !element.locked)}>{element.locked ? "Unlock" : "Lock"}</button>
          <button type="button" aria-label={`Move ${element.id} to front`} onClick={() => onReorder(element.id, "front")}>Front</button>
          <button type="button" aria-label={`Move ${element.id} to back`} onClick={() => onReorder(element.id, "back")}>Back</button>
        </div>
      </li>)}
    </ol> : <p>No elements in this template.</p>}
  </section>;
}
