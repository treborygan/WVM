import { useEffect, useState, type FormEvent } from "react";

import type { Element, ElementGeometry, PageGeometry } from "../../../domain/template-document";
import "./editor.css";

type GeometryDraft = Record<keyof ElementGeometry, string>;
type PageDraft = { readonly width_mm: string; readonly height_mm: string; readonly orientation: PageGeometry["orientation"] };

function geometryDraft(element?: Element): GeometryDraft | null {
  if (!element) return null;
  return { x_mm: String(element.x_mm), y_mm: String(element.y_mm), width_mm: String(element.width_mm), height_mm: String(element.height_mm), rotation_degrees: String(element.rotation_degrees) };
}

export function Inspector({ element, page, onApplyGeometry, onApplyPage }: {
  readonly element?: Element;
  readonly page: PageGeometry;
  readonly onApplyGeometry: (elementId: string, geometry: ElementGeometry) => void;
  readonly onApplyPage: (geometry: Pick<PageGeometry, "width_mm" | "height_mm" | "orientation">) => void;
}) {
  const [geometry, setGeometry] = useState<GeometryDraft | null>(() => geometryDraft(element));
  const [pageDraft, setPageDraft] = useState<PageDraft>(() => ({ width_mm: String(page.width_mm), height_mm: String(page.height_mm), orientation: page.orientation }));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setGeometry(geometryDraft(element)); setError(null); }, [element?.id, element?.x_mm, element?.y_mm, element?.width_mm, element?.height_mm, element?.rotation_degrees]);
  useEffect(() => { setPageDraft({ width_mm: String(page.width_mm), height_mm: String(page.height_mm), orientation: page.orientation }); }, [page]);

  function applyElement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!element || !geometry) return;
    if (Object.values(geometry).some((value) => value.trim() === "" || !Number.isFinite(Number(value)))) { setError("Enter finite numbers for every geometry field."); return; }
    const values = Object.fromEntries(Object.entries(geometry).map(([key, value]) => [key, Number(value)])) as unknown as ElementGeometry;
    if (values.width_mm <= 0 || values.height_mm <= 0) { setError("Width and height must be greater than zero millimetres."); return; }
    setError(null);
    onApplyGeometry(element.id, values);
  }

  function applyPage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const width_mm = Number(pageDraft.width_mm);
    const height_mm = Number(pageDraft.height_mm);
    if (pageDraft.width_mm.trim() === "" || pageDraft.height_mm.trim() === "" || !Number.isFinite(width_mm) || !Number.isFinite(height_mm) || width_mm <= 0 || height_mm <= 0) {
      setError("Page width and height must be finite positive millimetres."); return;
    }
    setError(null);
    onApplyPage({ ...pageDraft, width_mm, height_mm });
  }

  return <aside className="editor-inspector" aria-label="Document inspector">
    <form className="inspector-section" onSubmit={applyPage}>
      <h3>Page size</h3>
      <label>Width (mm)<input aria-label="Page width (mm)" type="number" step="0.1" value={pageDraft.width_mm} onChange={(event) => setPageDraft({ ...pageDraft, width_mm: event.target.value })} /></label>
      <label>Height (mm)<input aria-label="Page height (mm)" type="number" step="0.1" value={pageDraft.height_mm} onChange={(event) => setPageDraft({ ...pageDraft, height_mm: event.target.value })} /></label>
      <label>Orientation<select aria-label="Page orientation" value={pageDraft.orientation} onChange={(event) => setPageDraft({ ...pageDraft, orientation: event.target.value as PageGeometry["orientation"] })}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
      <button className="button button-secondary" type="submit">Apply page size</button>
    </form>
    <form className="inspector-section" onSubmit={applyElement}>
      <h3>Element geometry</h3>
      {element && geometry ? <>
        <p className="inspector-element-name">{element.id}{element.locked ? " · locked" : ""}</p>
        {(["x_mm", "y_mm", "width_mm", "height_mm", "rotation_degrees"] as const).map((key) => <label key={key}>{key.replaceAll("_mm", "").replaceAll("_", " ")} ({key.endsWith("_mm") ? "mm" : "degrees"})
          <input aria-label={`${key.replaceAll("_mm", "").replaceAll("_", " ")} (${key.endsWith("_mm") ? "mm" : "degrees"})`} type="number" step="0.1" value={geometry[key]} disabled={element.locked} onChange={(event) => setGeometry({ ...geometry, [key]: event.target.value })} />
        </label>)}
        <button className="button button-primary" type="submit" disabled={element.locked}>Apply geometry</button>
      </> : <p>Select an element from the artboard or Layers.</p>}
    </form>
    {error ? <p className="inspector-error" role="alert">{error}</p> : null}
  </aside>;
}
