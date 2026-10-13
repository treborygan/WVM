import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import type { TemplateFamily } from "../../domain/entities";
import { desktopCatalogGateway, type CatalogGateway, type CatalogListQuery, type TemplateChoice, type VisualDetail, type VisualRow } from "./catalog-gateway";
import "./catalog.css";

const familyLabels: Record<TemplateFamily, string> = {
  "gang-standard-2up": "Gang standard 2-up",
  "gang-special-2up": "Gang composite 2-up",
  "flow-sticker-12up": "Flow sticker 12-up",
  "stand-standard-3up": "Stand standard 3-up",
  "stand-level-instruction-3up": "Stand level / instruction 3-up",
};

type DialogMode = "create" | "edit" | null;

export function CatalogApp({ gateway = desktopCatalogGateway }: { readonly gateway?: CatalogGateway }) {
  const [query, setQuery] = useState<CatalogListQuery>({ page: 1, page_size: 50, sort_by: "name", sort_order: "asc" });
  const [searchInput, setSearchInput] = useState("");
  const [rows, setRows] = useState<readonly VisualRow[]>([]);
  const [templates, setTemplates] = useState<readonly TemplateChoice[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [selected, setSelected] = useState<VisualDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const loadGeneration = useRef(0);
  const detailGeneration = useRef(0);

  const load = useCallback(async (nextQuery: CatalogListQuery, nextSelected?: VisualDetail | null) => {
    const generation = ++loadGeneration.current;
    if (nextSelected !== undefined) {
      detailGeneration.current += 1;
      setDetailLoading(false);
    }
    setLoading(true);
    setError(null);
    try {
      const [page, choices] = await Promise.all([gateway.list(nextQuery), gateway.templates()]);
      if (generation !== loadGeneration.current) return;
      setRows(page.items);
      setTotal(page.total);
      setTotalPages(page.total_pages);
      setTemplates(choices);
      if (nextSelected !== undefined) setSelected(nextSelected);
    } catch (reason) {
      if (generation !== loadGeneration.current) return;
      setError(reason instanceof Error ? reason.message : "The local catalog could not be loaded.");
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [gateway]);

  useEffect(() => { void load(query); }, [load, query]);
  useEffect(() => () => { detailGeneration.current += 1; }, []);
  useEffect(() => {
    if (dialogMode && dialogRef.current && !dialogRef.current.open) {
      if (dialogRef.current.showModal) dialogRef.current.showModal();
      else dialogRef.current.setAttribute("open", "");
    }
    if (!dialogMode && dialogRef.current?.open) {
      if (dialogRef.current.close) dialogRef.current.close();
      else dialogRef.current.removeAttribute("open");
    }
  }, [dialogMode]);

  const chosenTemplate = useMemo(() => templates.find((choice) => choice.template.id === selected?.visual.template_id), [selected?.visual.template_id, templates]);

  async function selectVisual(row: VisualRow) {
    const generation = ++detailGeneration.current;
    setSelected(null);
    setDetailLoading(true);
    setActionError(null);
    try {
      const detail = await gateway.detail(row.id);
      if (generation === detailGeneration.current) setSelected(detail);
    } catch (reason) {
      if (generation === detailGeneration.current) {
        setSelected(null);
        setActionError(reason instanceof Error ? reason.message : "The visual details could not be loaded.");
      }
    } finally {
      if (generation === detailGeneration.current) setDetailLoading(false);
    }
  }

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = { ...query, search: searchInput.trim() || undefined, page: 1 };
    setQuery(nextQuery);
  }

  async function initializeSamples() {
    setBusy(true); setActionError(null);
    try {
      await gateway.initializeSyntheticSamples();
      setSelected(null);
      await load(query, null);
      setNotice("Synthetic catalog created. All examples are marked as samples.");
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : "Synthetic samples could not be created."); }
    finally { setBusy(false); }
  }

  async function createVisual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const templateId = String(form.get("template_id"));
    const choice = templates.find((item) => item.template.id === templateId);
    if (!choice) { setActionError("Choose an available template."); return; }
    setBusy(true); setActionError(null);
    try {
      const detail = await gateway.create({
        template_id: choice.template.id,
        template_version_id: choice.selected_version_id,
        visual: {
          name: String(form.get("name") ?? "").trim(), visual_type: choice.template.visual_type,
          stock_class: String(form.get("stock_class") ?? "").trim() || undefined,
          location: String(form.get("location") ?? "").trim() || undefined,
          flow: String(form.get("flow") ?? "").trim() || undefined,
        },
        values: Object.fromEntries(["location", "flow"].map((key) => [key, String(form.get(key) ?? "").trim() || null])),
      });
      setDialogMode(null); await load(query, detail); setNotice("Visual created as a draft.");
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : "The visual could not be created."); }
    finally { setBusy(false); }
  }

  async function saveVisual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected?.current_version) return;
    const form = new FormData(event.currentTarget);
    const chosen = templates.find((item) => item.template.id === selected.visual.template_id);
    if (!chosen) { setActionError("The selected template is unavailable."); return; }
    setBusy(true); setActionError(null);
    try {
      const detail = await gateway.saveDraft({
        visual_id: selected.visual.id, expected_revision_id: selected.current_version.id,
        template_version_id: selected.current_version.template_version_id,
        visual: {
          name: String(form.get("name") ?? "").trim(), visual_type: selected.visual.visual_type,
          stock_class: String(form.get("stock_class") ?? "").trim() || undefined,
          location: String(form.get("location") ?? "").trim() || undefined,
          flow: String(form.get("flow") ?? "").trim() || undefined,
          description: String(form.get("description") ?? "").trim() || undefined,
          accent_color: selected.visual.accent_color,
        },
        values: {
          ...selected.current_version.values,
          name: String(form.get("name") ?? "").trim(),
          stock_class: String(form.get("stock_class") ?? "").trim() || null,
          location: String(form.get("location") ?? "").trim() || null,
          flow: String(form.get("flow") ?? "").trim() || null,
          description: String(form.get("description") ?? "").trim() || null,
          accent_color: selected.visual.accent_color ?? null,
        },
        notes: String(form.get("notes") ?? "").trim() || undefined,
        special_validation: selected.template_family === "gang-special-2up" ? {
          state: String(form.get("special_validation_state") ?? "pending"),
          reviewer_id: String(form.get("reviewer_id") ?? "").trim(),
          reviewed_at: form.get("reviewed_at") ? new Date(String(form.get("reviewed_at"))).toISOString() : "",
          evidence_ref: String(form.get("evidence_ref") ?? "").trim(),
        } : undefined,
      });
      setDialogMode(null); await load(query, detail); setNotice("Draft saved as a new immutable version.");
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : "The draft could not be saved."); }
    finally { setBusy(false); }
  }

  async function duplicateVisual() {
    if (!selected) return;
    setBusy(true); setActionError(null);
    try { const detail = await gateway.duplicate(selected.visual.id); await load(query, detail); setNotice("Duplicate created as a new draft."); }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : "The visual could not be duplicated."); }
    finally { setBusy(false); }
  }

  async function transition(action: "submit_for_review" | "return_to_draft" | "publish" | "retire" | "reactivate") {
    if (!selected?.current_version) return;
    setBusy(true); setActionError(null);
    try {
      const detail = await gateway.transition({ visual_id: selected.visual.id, expected_state: selected.visual.lifecycle_state, expected_revision_id: selected.current_version.id, action });
      await load(query, detail); setNotice(`Lifecycle updated: ${detail.visual.lifecycle_state}.`);
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : "The lifecycle action could not be completed."); }
    finally { setBusy(false); }
  }

  const shownDialog = dialogMode;
  return (
    <div className="catalog-shell">
      <aside className="side-rail" aria-label="Main navigation">
        <div className="product-name"><span className="product-mark" aria-hidden="true">W</span><strong>Warehouse<br />Visual Manager</strong></div>
        <nav aria-label="Workspace">
          <a className="nav-item is-current" href="#catalog" aria-current="page"><span aria-hidden="true">▦</span>Catalog</a>
          <a className="nav-item" href="#templates"><span aria-hidden="true">▤</span>Templates</a>
          <a className="nav-item" href="#assets"><span aria-hidden="true">▧</span>Assets</a>
          <a className="nav-item" href="#settings"><span aria-hidden="true">⚙</span>Settings</a>
        </nav>
        <p className="local-state">Local catalog</p>
      </aside>

      <main className="catalog-main" id="catalog">
        <header className="page-header"><h1>Visual catalog</h1><button className="button button-primary" onClick={() => { setActionError(null); setDialogMode("create"); }} disabled={!templates.length || busy}>New visual</button></header>
        <div className="catalog-content">
          <section className="catalog-list" aria-label="Visual catalog results">
            <form className="search-form" onSubmit={submitSearch}>
              <label className="search-field"><span className="visually-hidden">Search visuals</span><span aria-hidden="true">⌕</span>
                <input type="search" name="search" aria-label="Search visuals" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search visuals by name, family, location, or legacy source" />
              </label>
              <button className="button button-secondary" type="submit">Search</button>
            </form>
            <div className="filter-row">
              <label>Type<select name="visual_type" value={query.visual_type ?? ""} onChange={(event) => setQuery({ ...query, visual_type: event.target.value || undefined, page: 1 })}><option value="">All types</option>{[["gang", "Gang"], ["flow_sticker", "Flow sticker"], ["stand", "Stand"]].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
              <label>Family<select name="template_family" value={query.template_family ?? ""} onChange={(event) => setQuery({ ...query, template_family: (event.target.value || undefined) as TemplateFamily | undefined, page: 1 })}><option value="">All families</option>{Object.entries(familyLabels).map(([family, label]) => <option key={family} value={family}>{label}</option>)}</select></label>
              <label>Stock class<input name="stock_class" value={query.stock_class ?? ""} onChange={(event) => setQuery({ ...query, stock_class: event.target.value || undefined, page: 1 })} /></label>
              <label>Location<input name="location" value={query.location ?? ""} onChange={(event) => setQuery({ ...query, location: event.target.value || undefined, page: 1 })} /></label>
              <label>Flow<input name="flow" value={query.flow ?? ""} onChange={(event) => setQuery({ ...query, flow: event.target.value || undefined, page: 1 })} /></label>
              <label>Description<input name="description" value={query.description ?? ""} onChange={(event) => setQuery({ ...query, description: event.target.value || undefined, page: 1 })} /></label>
              <label>Legacy source<input name="legacy_source" value={query.legacy_source ?? ""} onChange={(event) => setQuery({ ...query, legacy_source: event.target.value || undefined, page: 1 })} /></label>
              <label>State<select name="lifecycle_state" value={query.lifecycle_state ?? ""} onChange={(event) => setQuery({ ...query, lifecycle_state: event.target.value || undefined, page: 1 })}><option value="">All states</option>{["Draft", "Review", "Published", "Retired"].map((state) => <option key={state}>{state}</option>)}</select></label>
              <label>Sort by<select name="sort_by" value={query.sort_by ?? "name"} onChange={(event) => setQuery({ ...query, sort_by: event.target.value, sort_order: "asc", page: 1 })}>{[["name", "Name"], ["visual_type", "Type"], ["template_family", "Family"], ["location", "Location"], ["flow", "Flow"], ["lifecycle_state", "State"]].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
              <label>Direction<select name="sort_order" value={query.sort_order ?? "asc"} onChange={(event) => setQuery({ ...query, sort_order: event.target.value, page: 1 })}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
            </div>
            {loading ? <p className="status-line" role="status">Loading visuals</p> : null}
            {error ? <div className="error-panel" role="alert"><p>{error}</p><button className="button button-secondary" onClick={() => void load(query)}>Retry</button></div> : null}
            {notice ? <p className="status-line notice" role="status">{notice}</p> : null}
            {actionError ? <p className="error-inline" role="alert">{actionError}</p> : null}
            {!loading && !error && rows.length === 0 ? (
              <div className="empty-state"><h2>{templates.length ? "No visuals match this search" : "No visuals yet"}</h2>
                <p>{templates.length ? "Clear filters or create a visual from an available template." : "The local catalog is ready. Add clearly marked synthetic examples to explore the five template families."}</p>
                {templates.length ? <button className="button button-primary" onClick={() => setDialogMode("create")}>New visual</button> : <button className="button button-primary" onClick={() => void initializeSamples()} disabled={busy}>Create synthetic sample catalog</button>}
              </div>
            ) : null}
            {rows.length > 0 ? <>
              <p className="result-count" aria-live="polite">{total} visuals</p>
              <div className="table-scroll"><table className="visual-table"><thead><tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Family</th><th scope="col">Stock class</th><th scope="col">Location</th><th scope="col">Flow</th><th scope="col">Source</th><th scope="col">State</th><th scope="col">Updated</th></tr></thead>
                <tbody>{rows.map((row) => <tr key={row.id} className={selected?.visual.id === row.id ? "selected-row" : ""} tabIndex={0} aria-selected={selected?.visual.id === row.id} onClick={() => void selectVisual(row)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void selectVisual(row); } }}>
                  <th scope="row"><button type="button" className="row-link" onClick={(event) => { event.stopPropagation(); void selectVisual(row); }}>{row.name}</button></th><td>{row.visual_type}</td><td>{familyLabels[row.template_family]}</td><td>{row.stock_class ?? "—"}</td><td>{row.location ?? "—"}</td><td>{row.flow ?? "—"}</td><td>{row.legacy_search_text ?? "—"}</td><td><span className={`state-text state-${row.lifecycle_state.toLowerCase()}`}>{row.lifecycle_state}</span></td><td>{formatDate(row.updated_at)}</td>
                </tr>)}</tbody></table></div>
              <div className="pagination" aria-label="Catalog pagination"><span>Page {query.page} of {totalPages || 1}</span><button className="button button-secondary" onClick={() => setQuery({ ...query, page: Math.max(1, query.page - 1) })} disabled={loading || query.page <= 1}>Previous</button><button className="button button-secondary" onClick={() => setQuery({ ...query, page: query.page + 1 })} disabled={loading || query.page >= totalPages}>Next</button></div>
            </> : null}
          </section>

          {selected ? <aside className="detail-pane" aria-label="Visual details">
            <div className="detail-title"><div><h2>{selected.visual.name}</h2><p>{familyLabels[selected.template_family]}</p></div><span className={`state-label state-${selected.visual.lifecycle_state.toLowerCase()}`}>{selected.visual.lifecycle_state}</span></div>
            <div className="detail-actions"><button className="button button-primary" onClick={() => void duplicateVisual()} disabled={busy}>Duplicate visual</button>
              {selected.visual.lifecycle_state === "Draft" || selected.visual.lifecycle_state === "Published" ? <button className="button button-secondary" onClick={() => setDialogMode("edit")} disabled={!chosenTemplate || busy}>Edit visual</button> : null}</div>
            <dl className="detail-fields"><Field label="Type" value={selected.visual.visual_type} /><Field label="Stock class" value={selected.visual.stock_class} /><Field label="Location" value={selected.visual.location} /><Field label="Flow" value={selected.visual.flow} /><Field label="Description" value={selected.visual.description} /><Field label="Accent color" value={selected.visual.accent_color} /></dl>
            {selected.template_family === "gang-special-2up" ? <p className="validation-note">Special Gang validation: {selected.current_version?.special_validation?.state ?? "pending"}. Reviewer evidence is required before publication.</p> : null}
            {selected.visual.lifecycle_state === "Draft" ? <button className="button button-secondary lifecycle-action" onClick={() => void transition("submit_for_review")} disabled={busy || !selected.current_version}>Submit for review</button> : null}
            {selected.visual.lifecycle_state === "Review" ? <div className="detail-actions lifecycle-actions"><button className="button button-secondary" onClick={() => void transition("return_to_draft")} disabled={busy}>Return to draft</button><button className="button button-primary" onClick={() => void transition("publish")} disabled={busy}>Publish</button></div> : null}
            {selected.visual.lifecycle_state === "Published" ? <button className="button button-secondary lifecycle-action" onClick={() => void transition("retire")} disabled={busy}>Retire</button> : null}
            {selected.visual.lifecycle_state === "Retired" ? <button className="button button-secondary lifecycle-action" onClick={() => void transition("reactivate")} disabled={busy}>Reactivate as draft</button> : null}
            <section className="history-section"><h3>Version history</h3>{selected.history.length ? <ol className="history-list">{[...selected.history].reverse().map((version) => <li key={version.id}><div><strong>Version {version.version_number}</strong><span>{version.published_at ? "Published" : "Draft"}</span></div><time dateTime={version.created_at}>{formatDate(version.created_at)}</time>{version.published_at ? <span className="immutable-note">Immutable published version</span> : null}</li>)}</ol> : <p>No versions recorded.</p>}</section>
            {selected.visual.current_published_version_id ? <p className="published-note">Published version {selected.history.find((version) => version.id === selected.visual.current_published_version_id)?.version_number} remains immutable.</p> : null}
          </aside> : <aside className="detail-pane detail-placeholder" aria-busy={detailLoading}>
            <h2>Select a visual</h2>
            {detailLoading ? <p role="status">Loading visual details</p> : <p>Choose a row to inspect its fields and version history.</p>}
          </aside>}
        </div>
      </main>

      <dialog ref={dialogRef} aria-labelledby="visual-form-title" onCancel={() => setDialogMode(null)} onClose={() => setDialogMode(null)}>
        {shownDialog ? <form className="visual-form" onSubmit={shownDialog === "create" ? createVisual : saveVisual}>
          <div className="dialog-heading"><h2 id="visual-form-title">{shownDialog === "create" ? "New visual" : "Edit visual"}</h2><button type="button" className="close-button" aria-label="Close" onClick={() => setDialogMode(null)}>×</button></div>
          <fieldset><legend>{shownDialog === "create" ? "Visual details" : "Draft changes"}</legend>
            {shownDialog === "create" ? <label>Name <input name="name" required maxLength={160} autoComplete="off" /></label> : <label>Name <input name="name" defaultValue={selected?.visual.name} required maxLength={160} autoComplete="off" /></label>}
            {shownDialog === "create" ? <label>Template family <select name="template_id" required defaultValue=""><option value="" disabled>Choose a template family</option>{templates.map((choice) => <option key={choice.template.id} value={choice.template.id}>{familyLabels[choice.template.family]} · {choice.template.name}</option>)}</select></label> : null}
            <label>Stock class <input name="stock_class" defaultValue={shownDialog === "edit" ? selected?.visual.stock_class : ""} maxLength={100} /></label>
            <label>Location <input name="location" defaultValue={shownDialog === "edit" ? selected?.visual.location : ""} maxLength={160} autoCapitalize="off" spellCheck={false} /></label>
            <label>Flow <input name="flow" defaultValue={shownDialog === "edit" ? selected?.visual.flow : ""} maxLength={160} autoCapitalize="off" spellCheck={false} /></label>
            {shownDialog === "edit" ? <><label>Description <textarea name="description" defaultValue={selected?.visual.description} maxLength={2000} /></label><label>Change note <input name="notes" maxLength={500} /></label></> : null}
            {shownDialog === "edit" && selected?.template_family === "gang-special-2up" ? <fieldset className="validation-fields"><legend>Special Gang validation</legend>
              <label>Validation state<select name="special_validation_state" defaultValue={selected.current_version?.special_validation?.state ?? "pending"}><option value="pending">Pending</option><option value="validated">Validated</option><option value="rejected">Rejected</option></select></label>
              <label>Reviewer ID<input name="reviewer_id" defaultValue={selected.current_version?.special_validation?.reviewer_id ?? ""} maxLength={128} /></label>
              <label>Reviewed at<input name="reviewed_at" type="datetime-local" defaultValue={selected.current_version?.special_validation?.reviewed_at?.slice(0, 16) ?? ""} /></label>
              <label>Evidence reference<input name="evidence_ref" defaultValue={selected.current_version?.special_validation?.evidence_ref ?? ""} maxLength={500} /></label>
            </fieldset> : null}
          </fieldset>
          <div className="dialog-actions"><button type="button" className="button button-secondary" onClick={() => setDialogMode(null)}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}>{shownDialog === "create" ? "Create visual" : "Save draft"}</button></div>
        </form> : null}
      </dialog>
    </div>
  );
}

function Field({ label, value }: { readonly label: string; readonly value?: string }) {
  return <div><dt>{label}</dt><dd>{value || "—"}</dd></div>;
}

function formatDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}
