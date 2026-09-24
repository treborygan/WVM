# Project context

## Problem and intended change

Warehouse signs and stickers are currently represented by editable PowerPoint decks and Excel workbooks. Those files mix content, presentation, and repeated branding, making catalog search, controlled edits, consistent layouts, version history, and reliable print output difficult. WVM makes structured visual data and reusable layouts authoritative; legacy documents remain read-only migration evidence.

## Proof-of-concept evidence

The supplied migration report and catalog describe 145 normalized visual records, five template families, 124 standard Gang records, six composite/legacy Gang exceptions, and one centrally referenced brand asset. The POC SQLite has `brands`, `templates`, `visuals`, and `audit_log` entities. It demonstrates catalog search/filter, preview, local editing, duplication, status changes, browser print, SVG export, JSON export, and SQLite storage.

The template families are:

1. Gang visual — standard 2-up.
2. Gang visual — composite/special 2-up.
3. Flow sticker — 12-up.
4. Stand visual — standard 3-up.
5. Stand visual — level/instruction 3-up.

The stable IDs include `WVM-F-001`, `WVM-G-001`, and `WVM-X-001`. Imported identities and source provenance must survive migration. All six records in the special Gang family remain visibly gated from trusted publication until each has explicit manual validation against the physical sign.

## Known POC limitations

- POC template rows describe families and copy counts, not complete editable, versioned layouts.
- POC browser edits use localStorage and are not authoritative SQLite history.
- Browser print and SVG preview do not establish deterministic PDF output or physical print fidelity.
- POC lifecycle/status fields do not provide immutable published versions or a complete append-only audit trail.
- The POC README and migration report proposed SharePoint as production persistence. V1 intentionally supersedes that proposal with local SQLite; SharePoint is a future adapter.

## V1 user roles and use cases

- **Catalog user:** search and filter visuals, inspect approved output, export/print, and create a permitted draft or duplicate.
- **Editor:** edit content and layout on a visual canvas; tune physical dimensions, typography, color, assets, layers, and bindings; undo/redo; save as a new draft version.
- **Administrator:** manage brand profiles/assets, templates, lifecycle transitions, local backup/restore, and private migration review.

V1 is a single-user local application. Roles describe capability boundaries and user workflows; networked identity, multi-user collaboration, and enterprise approval integrations are post-V1.

## Source-of-truth hierarchy

1. Current published WVM versions in the local application database are the V1 operational source of truth.
2. Draft versions are editable working copies and are not approved print masters.
3. Private, read-only legacy files and POC exports are migration evidence; they do not override a published WVM version.
4. Synthetic repository fixtures exist only to test the code and migration behavior; they are not warehouse data.

## Terminology

| Term | Meaning |
|---|---|
| Visual | Stable identity and searchable current-state metadata for a sign/sticker record. |
| VisualVersion | Immutable version of the variable warehouse content and selected template version. |
| Template | Stable identity, family, and lifecycle for a reusable layout. |
| TemplateVersion | Immutable layout and print-rule version. |
| TemplateDocument | Schema-versioned JSON document containing page geometry, elements, defaults, and repetition rules. |
| BrandProfile | Centrally managed logo and semantic style tokens referenced during rendering. |
| Asset | Deduplicated local binary metadata and locator, such as a logo image. |
| RenderScene | Resolved, renderer-independent geometry and content produced from versions, bindings, brand tokens, and assets. |
| Special Gang exception | One of six migrated composite/legacy Gang records awaiting explicit physical validation. |
