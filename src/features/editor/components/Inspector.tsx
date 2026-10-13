import { useEffect, useState, type FormEvent } from "react";

import type { Element, ElementGeometry, PageGeometry, TextStyle } from "../../../domain/template-document";
import "./editor.css";

type GeometryDraft = Record<keyof ElementGeometry, string>;
type PageDraft = { readonly width_mm: string; readonly height_mm: string; readonly orientation: PageGeometry["orientation"] };
type TextDraft = { readonly value: string; readonly font_size_pt: string; readonly font_weight: string; readonly color: string };

function geometryDraft(element?: Element): GeometryDraft | null {
  if (!element) return null;
  return { x_mm: String(element.x_mm), y_mm: String(element.y_mm), width_mm: String(element.width_mm), height_mm: String(element.height_mm), rotation_degrees: String(element.rotation_degrees) };
}

function textDraft(element?: Element): TextDraft | null {
  if (!element || element.type !== "text") return null;
  return {
    value: element.content.kind === "literal" ? element.content.value : element.content.path,
    font_size_pt: String(element.style.font_size_pt),
    font_weight: String(element.style.font_weight),
    color: element.style.color.kind === "literal" ? element.style.color.value : "#000000",
  };
}

type TextAuthoring = { readonly value?: string; readonly font_size_pt: number; readonly font_weight: TextStyle["font_weight"]; readonly color?: string };

export function Inspector({ element, page, onApplyGeometry, onApplyPage, onApplyTextAuthoring, onApplyShapeFill }: {
  readonly element?: Element;
  readonly page: PageGeometry;
  readonly onApplyGeometry: (elementId: string, geometry: ElementGeometry) => void;
  readonly onApplyPage: (geometry: Pick<PageGeometry, "width_mm" | "height_mm" | "orientation">) => void;
  readonly onApplyTextAuthoring?: (elementId: string, authoring: TextAuthoring) => void;
  readonly onApplyShapeFill?: (elementId: string, color: string) => void;
}) {
  const [geometry, setGeometry] = useState<GeometryDraft | null>(() => geometryDraft(element));
  const [pageDraft, setPageDraft] = useState<PageDraft>(() => ({ width_mm: String(page.width_mm), height_mm: String(page.height_mm), orientation: page.orientation }));
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState<TextDraft | null>(() => textDraft(element));
  const [shapeFill, setShapeFill] = useState(() => element && (element.type === "rectangle" || element.type === "band" || element.type === "background") && element.style.fill.kind === "literal" ? element.style.fill.value : "#000000");

  useEffect(() => { setGeometry(geometryDraft(element)); setText(textDraft(element)); setShapeFill(element && (element.type === "rectangle" || element.type === "band" || element.type === "background") && element.style.fill.kind === "literal" ? element.style.fill.value : "#000000"); setError(null); }, [element]);
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

  function applyText(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!element || element.type !== "text" || !text) return;
    const font_size_pt = Number(text.font_size_pt);
    const weightNumber = Number(text.font_weight);
    const font_weight = text.font_weight === "normal" || text.font_weight === "bold" ? text.font_weight : weightNumber;
    if (text.font_size_pt.trim() === "" || !Number.isFinite(font_size_pt) || font_size_pt <= 0 || (typeof font_weight === "number" && (!Number.isInteger(font_weight) || font_weight < 100 || font_weight > 900 || font_weight % 100 !== 0))) {
      setError("Font size must be positive and font weight must be normal, bold, or 100–900."); return;
    }
    setError(null);
    onApplyTextAuthoring?.(element.id, {
      ...(element.content.kind === "literal" ? { value: text.value } : {}),
      font_size_pt,
      font_weight,
      ...(element.style.color.kind === "literal" ? { color: text.color } : {}),
    });
  }

  function applyShapeFill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!element || (element.type !== "rectangle" && element.type !== "band" && element.type !== "background") || element.style.fill.kind !== "literal") return;
    setError(null);
    onApplyShapeFill?.(element.id, shapeFill);
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
    {element?.type === "text" && text ? <form className="inspector-section" onSubmit={applyText}>
      <h3>Text style</h3>
      <label>Text content<input aria-label="Text content" type="text" value={text.value} disabled={element.locked || element.content.kind !== "literal"} onChange={(event) => setText({ ...text, value: event.target.value })} /></label>
      {element.content.kind === "binding" ? <p className="inspector-binding-note">Content is bound to {element.content.path}.</p> : null}
      <label>Font size (pt)<input aria-label="Font size (pt)" type="number" min="0.1" step="0.1" value={text.font_size_pt} disabled={element.locked} onChange={(event) => setText({ ...text, font_size_pt: event.target.value })} /></label>
      <label>Font weight<select aria-label="Font weight" value={text.font_weight} disabled={element.locked} onChange={(event) => setText({ ...text, font_weight: event.target.value })}><option value="normal">Normal</option><option value="bold">Bold</option><option value="400">400</option><option value="700">700</option><option value="900">900</option></select></label>
      <label>Text color<input aria-label="Text color" type="color" value={text.color} disabled={element.locked || element.style.color.kind !== "literal"} onChange={(event) => setText({ ...text, color: event.target.value })} /></label>
      {element.style.color.kind === "binding" ? <p className="inspector-binding-note">Color is bound to {element.style.color.path}.</p> : null}
      <button className="button button-primary" type="submit" disabled={element.locked || !onApplyTextAuthoring}>Apply text style</button>
    </form> : null}
    {element && (element.type === "rectangle" || element.type === "band" || element.type === "background") ? <form className="inspector-section" onSubmit={applyShapeFill}>
      <h3>Shape style</h3>
      <label>Fill color<input aria-label="Shape fill" type="color" value={shapeFill} disabled={element.locked || element.style.fill.kind !== "literal"} onChange={(event) => setShapeFill(event.target.value)} /></label>
      {element.style.fill.kind === "binding" ? <p className="inspector-binding-note">Fill is bound and cannot be changed here.</p> : null}
      <button className="button button-secondary" type="submit" disabled={element.locked || element.style.fill.kind !== "literal" || !onApplyShapeFill}>Apply shape fill</button>
    </form> : null}
    {error ? <p className="inspector-error" role="alert">{error}</p> : null}
  </aside>;
}
