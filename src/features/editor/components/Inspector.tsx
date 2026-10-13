import { useEffect, useState, type FormEvent } from "react";

import type { ColorBinding, ColorBindingPath, Element, ElementGeometry, PageGeometry, TextBinding, TextBindingPath, TextStyle } from "../../../domain/template-document";
import "./editor.css";

type GeometryDraft = Record<keyof ElementGeometry, string>;
type PageDraft = { readonly width_mm: string; readonly height_mm: string; readonly orientation: PageGeometry["orientation"] };
type TextDraft = { readonly value: string; readonly content_source: "literal" | TextBindingPath; readonly font_size_pt: string; readonly font_weight: string; readonly font_style: TextStyle["font_style"]; readonly horizontal_align: TextStyle["horizontal_align"]; readonly vertical_align: TextStyle["vertical_align"]; readonly color_source: "literal" | ColorBindingPath; readonly color: string };

function geometryDraft(element?: Element): GeometryDraft | null {
  if (!element) return null;
  return { x_mm: String(element.x_mm), y_mm: String(element.y_mm), width_mm: String(element.width_mm), height_mm: String(element.height_mm), rotation_degrees: String(element.rotation_degrees) };
}

function textDraft(element?: Element, values?: Readonly<Record<string, string | number | boolean | null>>): TextDraft | null {
  if (!element || element.type !== "text") return null;
  const contentSource = element.content.kind === "literal" ? "literal" : element.content.path;
  const colorSource = element.style.color.kind === "literal" ? "literal" : element.style.color.path;
  const currentValue = element.content.kind === "literal" ? element.content.value : values?.[element.content.path];
  const currentColor = element.style.color.kind === "literal" ? element.style.color.value : values?.[element.style.color.path];
  const color = typeof currentColor === "string" && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(currentColor) ? currentColor : "#000000";
  return {
    value: currentValue === null || currentValue === undefined ? "" : String(currentValue),
    content_source: contentSource,
    font_size_pt: String(element.style.font_size_pt),
    font_weight: String(element.style.font_weight),
    font_style: element.style.font_style,
    horizontal_align: element.style.horizontal_align,
    vertical_align: element.style.vertical_align,
    color_source: colorSource,
    color,
  };
}

type TextAuthoring = { readonly content: TextBinding; readonly font_size_pt: number; readonly font_weight: TextStyle["font_weight"]; readonly font_style: TextStyle["font_style"]; readonly horizontal_align: TextStyle["horizontal_align"]; readonly vertical_align: TextStyle["vertical_align"]; readonly color: ColorBinding };

export function Inspector({ element, page, values, onApplyGeometry, onApplyPage, onApplyTextAuthoring, onApplyShapeFill }: {
  readonly element?: Element;
  readonly page: PageGeometry;
  readonly values?: Readonly<Record<string, string | number | boolean | null>>;
  readonly onApplyGeometry: (elementId: string, geometry: ElementGeometry) => void;
  readonly onApplyPage: (geometry: Pick<PageGeometry, "width_mm" | "height_mm" | "orientation">) => void;
  readonly onApplyTextAuthoring?: (elementId: string, authoring: TextAuthoring) => void;
  readonly onApplyShapeFill?: (elementId: string, color: string) => void;
}) {
  const [geometry, setGeometry] = useState<GeometryDraft | null>(() => geometryDraft(element));
  const [pageDraft, setPageDraft] = useState<PageDraft>(() => ({ width_mm: String(page.width_mm), height_mm: String(page.height_mm), orientation: page.orientation }));
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState<TextDraft | null>(() => textDraft(element, values));
  const [shapeFill, setShapeFill] = useState(() => element && (element.type === "rectangle" || element.type === "band" || element.type === "background") && element.style.fill.kind === "literal" ? element.style.fill.value : "#000000");

  useEffect(() => { setGeometry(geometryDraft(element)); setText(textDraft(element, values)); setShapeFill(element && (element.type === "rectangle" || element.type === "band" || element.type === "background") && element.style.fill.kind === "literal" ? element.style.fill.value : "#000000"); setError(null); }, [element, values]);
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
      content: text.content_source === "literal" ? { kind: "literal", value: text.value } : { kind: "binding", path: text.content_source },
      font_size_pt,
      font_weight,
      font_style: text.font_style,
      horizontal_align: text.horizontal_align,
      vertical_align: text.vertical_align,
      color: text.color_source === "literal" ? { kind: "literal", value: text.color } : { kind: "binding", path: text.color_source },
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
      <label>Text source<select aria-label="Text source" value={text.content_source} disabled={element.locked} onChange={(event) => setText({ ...text, content_source: event.target.value as "literal" | TextBindingPath })}><option value="literal">Fixed text</option><option value="visual.name">Visual name</option><option value="visual.location">Location</option><option value="visual.flow">Flow</option><option value="visual.description">Description</option><option value="visual.stock_class">Stock class</option></select></label>
      <label>Text content<input aria-label="Text content" type="text" value={text.value} disabled={element.locked || text.content_source !== "literal"} onChange={(event) => setText({ ...text, value: event.target.value })} /></label>
      {text.content_source !== "literal" ? <p className="inspector-binding-note">Preview uses the selected visual field. Unavailable values appear as a binding marker.</p> : null}
      <label>Font size (pt)<input aria-label="Font size (pt)" type="number" min="0.1" step="0.1" value={text.font_size_pt} disabled={element.locked} onChange={(event) => setText({ ...text, font_size_pt: event.target.value })} /></label>
      <label>Font weight<select aria-label="Font weight" value={text.font_weight} disabled={element.locked} onChange={(event) => setText({ ...text, font_weight: event.target.value })}><option value="normal">Normal</option><option value="bold">Bold</option><option value="400">400</option><option value="700">700</option><option value="900">900</option></select></label>
      <label>Font style<select aria-label="Font style" value={text.font_style} disabled={element.locked} onChange={(event) => setText({ ...text, font_style: event.target.value as TextStyle["font_style"] })}><option value="normal">Normal</option><option value="italic">Italic</option></select></label>
      <label>Horizontal alignment<select aria-label="Horizontal alignment" value={text.horizontal_align} disabled={element.locked} onChange={(event) => setText({ ...text, horizontal_align: event.target.value as TextStyle["horizontal_align"] })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
      <label>Vertical alignment<select aria-label="Vertical alignment" value={text.vertical_align} disabled={element.locked} onChange={(event) => setText({ ...text, vertical_align: event.target.value as TextStyle["vertical_align"] })}><option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option></select></label>
      <label>Text color source<select aria-label="Text color source" value={text.color_source} disabled={element.locked} onChange={(event) => setText({ ...text, color_source: event.target.value as "literal" | ColorBindingPath })}><option value="literal">Fixed color</option><option value="visual.accent_color">Visual accent color</option><option value="brand.primary_color">Brand primary color</option></select></label>
      <label>Text color<input aria-label="Text color" type="color" value={text.color} disabled={element.locked || text.color_source !== "literal"} onChange={(event) => setText({ ...text, color: event.target.value })} /></label>
      {text.color_source !== "literal" ? <p className="inspector-binding-note">Preview uses the selected color field when it is available.</p> : null}
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
