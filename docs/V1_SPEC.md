# WVM V1 functional specification

This is the normative V1 behavior contract. Architecture and data contracts are in `ARCHITECTURE.md` and `DATA_MODEL.md`.

## Must-have V1

### Catalog and records

- Run as a Windows-first local desktop app with a local SQLite catalog.
- List, search, filter, and sort by name, visual type, template family, stock class, location, flow, description, lifecycle state, and legacy source metadata. Search must not require loading layout JSON for every row.
- Open a visual detail view and create, edit, or duplicate a visual. A duplicate gets a new stable ID, retains selected content/provenance as appropriate, and starts as Draft.
- Keep `Visual`, `Template`, `TemplateVersion`, `VisualVersion`, `BrandProfile`, `Asset`, and `AuditEvent` responsibilities separate.
- Preserve imported IDs and source references. Reject duplicate IDs rather than silently replacing records.

### Editor

- Provide an SVG-native canvas using the canonical TemplateDocument and RenderScene model. Edit page width/height and orientation in millimetres; edit element x/y/width/height in millimetres.
- Support text, rectangle/background/band, line/border, and image/logo elements; font family, point size, weight/style, alignments, line height, wrapping/overflow, fill/stroke/accent, and logo placement/scale.
- Support selection, drag, resize, zoom, pan, grid/guides, snapping, keyboard nudging, z-order/layers, visibility, lock state, and undo/redo.
- Provide a numeric inspector so exact placement and dimensions are available without pointer interaction. Invalid zero/negative sizes and non-finite values are rejected. Off-page positions may be edited but are visibly marked and blocked from publication until corrected or explicitly permitted by the template's print rules.
- Keep accessible labels, keyboard focus, keyboard selection/navigation, and equivalent inspector operations for core pointer actions.

### Templates, brand, lifecycle

- Support the five migrated template families: standard Gang 2-up, composite/special Gang 2-up, Flow sticker 12-up, standard Stand 3-up, and level/instruction Stand 3-up.
- Resolve visual fields and brand tokens through typed bindings; preserve literals as literals. Central brand/profile updates affect subsequent draft/current renders without rewriting each VisualVersion.
- Use lifecycle states Draft → Review → Published → Retired. Only an authorized local application command can transition state. Publishing points to immutable TemplateVersion/VisualVersion records. Editing a published record creates a new draft version; history remains unchanged.
- Prevent special Gang exception records from becoming trusted Published records until their validation state is explicitly recorded.

### Render, export, print

- Produce deterministic SVG from `TemplateVersion + VisualVersion + BrandProfile + Assets` via RenderScene. Editor preview and export use the same scene-building and renderer code.
- Compose 2-up, 3-up, and 12-up sheets from versioned print rules, with physical page size, margins, gaps, and slot dimensions tested in millimetres.
- Export a deterministic vector PDF from the canonical render output. Provide print preview and an explicit handoff to the operating-system print path. A browser print convenience path may be offered but cannot be the only export or acceptance route.
- Missing bindings, assets, or fonts return actionable diagnostics or a documented deterministic fallback; no silent layout corruption.

### Migration and operations

- Import from private local source paths through a staging pipeline; preserve stable IDs, references, baseline reconciliation, and exception gates. Never bundle real migration inputs in the public repository.
- Provide SQLite backup, restore, and portable export/import for a database and its referenced assets. Verify restore integrity before replacing active data.
- Package for Windows; use platform application-data directories by default and make upgrades preserve user data and apply schema migrations transactionally.

## V1 extension if low-risk

- Multi-select, copy/paste, rotation controls, and reusable user-created guides when each operation is covered by undo/redo and deterministic render tests.
- Browser-based print handoff as an optional convenience in addition to deterministic PDF export.

These extensions cannot delay correctness of physical dimensions, data safety, publication immutability, or the five template families.

## Post-V1

- SharePoint synchronization, Microsoft Graph/Power Automate integration, shared catalog/API deployment, multi-user collaboration, and enterprise approval workflow.
- ChatGPT Apps SDK or MCP integration.
- AI-assisted authoring/search, agent runtime, model gateway, RAG/vector database, and AI observability.
- Additional element families such as QR/barcode unless a separately approved requirement is established.

## Acceptance gates

V1 acceptance is the checklist in Task 22 of `IMPLEMENTATION_PLAN.md`: full test/build/package gates, private migration reconciliation, five families, six gated exceptions, golden output and exact physical dimensions, backup/restore integrity, and documentation synchronized with the shipped implementation.
