# Warehouse Visual Manager V1 Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking. Each task is an independently reviewable gate; retain the order below.

**Goal:** Build the Windows-first local Warehouse Visual Manager V1 for cataloging, editing, versioning, rendering, exporting, and printing warehouse visuals.

**Architecture:** Tauri 2 hosts a React/TypeScript UI and Rust adapters. Stable domain/application interfaces isolate local SQLite and filesystem storage. The editor and deterministic SVG/PDF exporter consume one versioned mm-based document/render model.

**Tech Stack:** Tauri 2, React, TypeScript, Rust, SQLite, SVG, deterministic vector PDF generation, Vitest/React Testing Library, and Rust unit/integration tests. Task 1 pins exact compatible tool versions and test scripts.

**Spec:** `docs/V1_SPEC.md`, with contracts in `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/CANVAS_EDITOR.md`, and `docs/RENDERING_PIPELINE.md`.

## Global Constraints

- Windows-first local desktop V1.
- Tauri 2 + React/TypeScript + Rust preferred stack.
- SQLite local system of record.
- No live shared SQLite over SharePoint/OneDrive/SMB.
- Canonical physical geometry in millimetres.
- SVG-native editor/renderer direction.
- Shared canonical document/render model.
- Deterministic SVG/PDF output.
- Template/visual/brand separation.
- Versioned immutable published records.
- Preserve legacy IDs and provenance.
- Real legacy/operational data stays out of the public repository.
- Synthetic fixtures only in Git.
- No automatic GitHub Actions.
- SharePoint and MCP are future adapters, not V1 dependencies.
- No AI runtime/RAG/vector database/model gateway in V1.
- TDD for implementation tasks.
- No merge without explicit user approval.

## Review Focus

- Zoom-independent geometry: identical intended physical pointer movement at 25%, 100%, and 400% must produce identical mm changes; test in Task 5.
- Published-version immutability: a post-publish edit cannot alter historical SVG/PDF; test in Tasks 7–9.
- Renderer/editor parity: identical canonical inputs must resolve identical scene geometry/content; test in Task 8.
- Font/asset failure: missing resources must yield an actionable diagnostic or exact declared fallback; test in Tasks 7–9.
- Migration exceptions: each `gang-special-2up` record remains blocked from trusted publication until manual validation; test in Task 4 and recheck in Task 7.

---

## Task 1: Establish the application skeleton and quality gates

**Files:**
- Create: `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`
- Create: `src/main.tsx`, `src/app/App.tsx`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/src/main.rs`
- Create: `tests/smoke/app.test.tsx`, `fixtures/synthetic/README.md`, `docs/DEPENDENCIES.md`
- Modify: `.gitignore`, `README.md`

**Interfaces:**
- Consumes: architecture boundaries in `docs/ARCHITECTURE.md`.
- Produces: `npm run test`, `npm run typecheck`, `npm run build`, `cargo test`; a Tauri shell with a rendered `App`; a synthetic-only fixture boundary; a dependency/licence register. No catalog/editor features.

- [x] **Step 1: Write a failing app smoke test** asserting `App` renders the application name and foundation status.
- [ ] **Step 2: Run `npm run test -- tests/smoke/app.test.tsx`;** expect failure because app/test configuration is absent.
- [x] **Step 3: Scaffold the Tauri 2 + React/TypeScript + Rust application** with pinned compatible versions, Vitest/React Testing Library, and the four package scripts. Record each direct dependency and licence in `docs/DEPENDENCIES.md`.
- [x] **Step 4: Implement the minimal `App` shell** and synthetic fixture policy; add no product operations.
- [x] **Step 5: Run `npm run test -- tests/smoke/app.test.tsx`, `npm run typecheck`, `npm run build`, and `cargo test`;** expect the smoke test and all configured checks to pass.
- [x] **Step 6: Check `git diff --check` and confirm no workflow automation or real data was added.**
- [x] **Step 7: Commit** as `chore: establish WVM application foundation` (`a8bfd81`).

## Task 2: Define canonical domain types, documents, and validation

**Files:**
- Create: `src/domain/ids.ts`, `src/domain/entities.ts`, `src/domain/template-document.ts`, `src/domain/lifecycle.ts`, `src/domain/validation.ts`
- Create: `src/domain/__tests__/template-document.test.ts`, `src/domain/__tests__/lifecycle.test.ts`, `src/domain/__tests__/validation.test.ts`
- Modify: `docs/DATA_MODEL.md` only if implementation requires a clarified contract; record the reason in the change.

**Interfaces:**
- Consumes: app/test gates from Task 1.
- Produces: `BrandProfile`, `Asset`, `Template`, `TemplateVersion`, `TemplateDocument`, `Element`, `Visual`, `VisualVersion`, `LegacySourceReference`, and `AuditEvent` types; `validateTemplateDocument(input): ValidationResult`; `transitionLifecycle(state, action): LifecycleResult`; stable ID parsing/generation. Domain files import no Tauri, SQL, or UI types.

- [x] **Step 1: Write failing tests** for valid schema-versioned mm documents; text/shape/image elements; duplicate element IDs; unsupported schema; missing binding; zero, negative, non-finite, and extreme geometry; lifecycle transitions; and rejected publication of unvalidated special records.
- [x] **Step 2: Run `npm run test -- src/domain/__tests__`;** expect failures for missing domain contracts.
- [x] **Step 3: Add tagged element and binding types** from `DATA_MODEL.md`; define immutable versions and exact lifecycle states.
- [x] **Step 4: Implement document and transition validation** with structured field/path diagnostics; reject unknown schema versions and invalid geometry.
- [x] **Step 5: Run the focused tests, `npm run typecheck`, then `npm run test`;** expect all domain tests to pass.
- [x] **Step 6: Verify public interfaces match `DATA_MODEL.md` and add no adapter imports.**
- [x] **Step 7: Commit** as `feat(domain): define canonical WVM contracts`.

## Task 3: Add SQLite schema, migrations, and repositories

**Files:**
- Create: `src/application/ports/VisualRepository.ts`, `src/application/ports/TemplateRepository.ts`, `src/application/ports/AssetRepository.ts`, `src/application/ports/Transaction.ts`
- Create: `src-tauri/src/adapters/sqlite/mod.rs`, `src-tauri/src/adapters/sqlite/visual_repository.rs`, `src-tauri/src/adapters/sqlite/template_repository.rs`, `src-tauri/src/adapters/sqlite/migrations/0001_initial.sql`
- Create: `src-tauri/src/adapters/sqlite/tests/repository_tests.rs`, `src/application/__tests__/repository-contract.test.ts`
- Modify: `src-tauri/src/main.rs`

**Interfaces:**
- Consumes: domain contracts from Task 2.
- Produces: repository interfaces for create/get/list/update-version operations, transaction boundary, numbered SQLite migration, foreign-key-enabled local database, temporary-database tests. SQLite row types remain within Rust adapters.

- [x] **Step 1: Write failing repository contract tests** for stable IDs, searchable fields, foreign-key enforcement, immutable version inserts, atomic version/current-pointer/audit writes, and rollback on injected failure.
- [x] **Step 2: Run `cargo test repository_contract`;** expect failure while the adapter/schema is absent.
- [x] **Step 3: Implement the initial schema** for brands, assets, templates, template versions, visuals, visual versions, legacy source references, audit events, and schema version. Add unique version indexes and catalog indexes.
- [x] **Step 4: Implement repository adapters and transaction handling** that map rows to Task 2 domain types and validate JSON on read/write.
- [x] **Step 5: Run `cargo test`, `npm run test -- src/application/__tests__/repository-contract.test.ts`, and `npm run typecheck`;** expect all checks to pass.
- [x] **Step 6: Inject a migration failure in a temporary database** and assert the schema remains at its prior version; verify `PRAGMA foreign_keys` is enabled on each connection.
- [x] **Step 7: Commit** as `feat(storage): add local SQLite repositories`.

## Task 4: Build private migration import and catalog read workflows

**Files:**
- Create: `src/application/catalog/list-visuals.ts`, `src/application/catalog/get-visual-detail.ts`, `src/application/catalog/duplicate-visual.ts`
- Create: `tools/migration/src/staging.ts`, `tools/migration/src/reconcile.ts`, `tools/migration/src/import.ts`
- Create: `fixtures/synthetic/migration/catalog.json`, `fixtures/synthetic/migration/expected-report.json`
- Create: `tests/migration/reconcile.test.ts`, `tests/application/catalog.test.ts`
- Modify: `docs/MIGRATION_STRATEGY.md` if implementation details require an explicit correction.

**Interfaces:**
- Consumes: domain and repositories from Tasks 2–3.
- Produces: `listVisuals(query): Page<VisualSummary>`, `getVisualDetail(id): VisualDetail`, `duplicateVisual(id): DraftVisual`; staging mapper; `reconcileMigration(staging, baseline): MigrationReport`; import command that preserves source refs and blocks count/hash drift. Import accepts operator-selected private input paths and never expects source files in Git.

- [ ] **Step 1: Write failing tests** for search/filter/sort, detail loading, duplicate identity/content, stable legacy IDs, provenance, count/hash mismatch, duplicate IDs, malformed source rows, and all six synthetic special-exception flags.
- [ ] **Step 2: Run `npm run test -- tests/migration tests/application/catalog.test.ts`;** expect failures before the use cases/importer exist.
- [ ] **Step 3: Implement catalog query/duplicate use cases** against repository interfaces; duplicate creates a new Draft identity and retains selected provenance.
- [ ] **Step 4: Implement staging normalization and reconciliation** for POC-shaped inputs, producing a machine-readable report and rejecting unexplained drift.
- [ ] **Step 5: Implement transactional import** with preserved IDs/references and explicit manual-validation state for `gang-special-2up` records.
- [ ] **Step 6: Run focused tests, `npm run typecheck`, and `cargo test`;** scan fixtures to confirm they contain only generated data.
- [ ] **Step 7: Commit** as `feat(catalog): add migration and read workflows`.

## Task 5: Implement the editor viewport and physical geometry

**Files:**
- Create: `src/features/editor/geometry/units.ts`, `src/features/editor/geometry/viewport.ts`, `src/features/editor/geometry/bounds.ts`
- Create: `src/features/editor/components/Artboard.tsx`, `src/features/editor/components/ViewportControls.tsx`
- Create: `src/features/editor/geometry/__tests__/viewport.test.ts`, `src/features/editor/geometry/__tests__/bounds.test.ts`, `tests/features/editor/Artboard.test.tsx`

**Interfaces:**
- Consumes: `TemplateDocument` and `Element` from Task 2.
- Produces: `mmToScreen(point, viewport): ScreenPoint`, `screenToMm(point, viewport): MmPoint`, `getElementBounds(element): BoundsMm`, and an SVG artboard rendering canonical physical geometry.

- [ ] **Step 1: Write failing tests** for mm↔screen round trip, 1 pt→mm font conversion, page aspect ratio, page bounds, and equivalent physical delta at 25%, 100%, and 400% zoom.
- [ ] **Step 2: Run `npm run test -- src/features/editor/geometry`;** expect failures before transform helpers exist.
- [ ] **Step 3: Implement unit/viewport transforms** with top-left origin, explicit CSS px/mm conversion, zoom, and pan.
- [ ] **Step 4: Render a minimal SVG artboard** with exact mm width/height/viewBox and zoom controls; do not add drag editing in this task.
- [ ] **Step 5: Run focused tests, `npm run typecheck`, and `npm run build`;** expect geometry and artboard tests to pass.
- [ ] **Step 6: Verify no screen pixel value is written into the canonical document.**
- [ ] **Step 7: Commit** as `feat(editor): add mm viewport and artboard`.

## Task 6: Add selection, manipulation, inspector, and edit history

**Files:**
- Create: `src/domain/editor-commands.ts`, `src/domain/editor-history.ts`
- Create: `src/features/editor/components/SelectionOverlay.tsx`, `src/features/editor/components/Inspector.tsx`, `src/features/editor/components/LayersPanel.tsx`
- Create: `src/features/editor/__tests__/manipulation.test.ts`, `src/domain/__tests__/editor-history.test.ts`, `tests/features/editor/Inspector.test.tsx`

**Interfaces:**
- Consumes: viewport and domain document from Tasks 2 and 5.
- Produces: typed immutable commands `moveElement`, `resizeElement`, `setElementGeometry`, `setPageGeometry`, `reorderElement`, `setElementVisibility`, `setElementLocked`; deterministic `EditorHistory.apply/undo/redo`; accessible selection and numeric inspector.

- [ ] **Step 1: Write failing tests** for zoom-independent drag/resize at 25/100/400%, anchor preservation, snap tolerance, positive dimensions, locked/hidden behavior, numeric edits, z-order, visibility, and deterministic undo/redo.
- [ ] **Step 2: Run `npm run test -- src/features/editor/__tests__ src/domain/__tests__/editor-history.test.ts`;** expect failures before commands/history are implemented.
- [ ] **Step 3: Implement immutable commands** with validation and one history entry per committed gesture/inspector apply; prohibit DOM snapshots.
- [ ] **Step 4: Implement selection handles, grid/guides, pointer drag/resize, and exact inspector controls** with keyboard equivalents and focus cues.
- [ ] **Step 5: Implement LayersPanel** with front/back and one-step ordering, visibility, and lock controls.
- [ ] **Step 6: Run focused tests, `npm run typecheck`, `npm run test`, and `npm run build`;** expect all editor checks to pass.
- [ ] **Step 7: Commit** as `feat(editor): add geometry editing and history`.

## Task 7: Add visual/template authoring, assets, and lifecycle rules

**Files:**
- Create: `src/application/templates/template-service.ts`, `src/application/visuals/visual-service.ts`, `src/application/brands/brand-service.ts`
- Create: `src/features/editor/components/StyleInspector.tsx`, `src/features/editor/components/BindingInspector.tsx`, `src/features/brands/AssetLibrary.tsx`
- Create: `src-tauri/src/adapters/local_assets.rs`, `src-tauri/src/adapters/sqlite/migrations/0002_lifecycle_audit.rs`
- Create: `tests/application/lifecycle.test.ts`, `tests/application/bindings.test.ts`, `tests/application/assets.test.ts`

**Interfaces:**
- Consumes: repositories and commands from Tasks 2–6.
- Produces: `resolveBinding(path, visual, brand): BindingResult`; asset add/get/replace by content hash; brand token resolution; draft creation from published versions; lifecycle transition commands; append-only audit events; special-record publication guard.

- [ ] **Step 1: Write failing tests** for visual/brand bindings, missing values, asset deduplication and replacement, logo propagation, lifecycle transitions, immutable published snapshots, audit append behavior, and special-record validation.
- [ ] **Step 2: Run `npm run test -- tests/application`;** expect failures before services and asset adapter exist.
- [ ] **Step 3: Implement typed binding and brand resolution** with diagnostics for unresolved paths and one central asset reference.
- [ ] **Step 4: Implement local asset storage** using content hashes and atomic file replacement; add metadata transaction and orphan cleanup behavior.
- [ ] **Step 5: Implement draft/version/lifecycle services** so publish is immutable, edits fork to Draft, audit records every consequential action, and exceptions remain gated.
- [ ] **Step 6: Add style and binding inspectors; run `npm run test`, `npm run typecheck`, `npm run build`, and `cargo test`;** expect all checks to pass.
- [ ] **Step 7: Commit** as `feat(domain): add bindings assets and lifecycle`.

## Task 8: Build canonical SVG rendering and multi-copy sheets

**Files:**
- Create: `src/rendering/render-scene.ts`, `src/rendering/resolve-layout.ts`, `src/rendering/svg-renderer.ts`, `src/rendering/sheet-composer.ts`
- Create: `src/rendering/__tests__/scene.test.ts`, `src/rendering/__tests__/svg-golden.test.ts`, `src/rendering/__tests__/sheet-composer.test.ts`
- Create: `fixtures/synthetic/render/`

**Interfaces:**
- Consumes: immutable template/visual versions, brand/assets, binding resolver from Tasks 2 and 7.
- Produces: `buildRenderScene(input): Result<RenderScene, RenderDiagnostic[]>`, `renderSceneToSvg(scene): string`, `composeSheet(scene, printRules): SheetScene`; pure and deterministic functions independent of DOM and database.

- [ ] **Step 1: Write failing tests** for binding/brand resolution, missing font/asset behavior, stable normalized SVG, exact mm root dimensions/viewBox, editor scene parity, and 2-up/3-up/12-up slot margins/gaps.
- [ ] **Step 2: Run `npm run test -- src/rendering`;** expect failures before render functions exist.
- [ ] **Step 3: Implement RenderScene resolution** from immutable domain inputs with actionable diagnostics and declared font fallback policy.
- [ ] **Step 4: Implement SVG output** with deterministic element order, stable attributes, embedded hash-identified assets, text point-to-mm conversion, and physical dimensions.
- [ ] **Step 5: Implement sheet composition** from template print rules and validate slots against page bounds without overlap.
- [ ] **Step 6: Run focused tests, `npm run test`, `npm run typecheck`, and `npm run build`;** expect all rendering tests to pass.
- [ ] **Step 7: Commit** as `feat(rendering): add deterministic SVG and sheet composition`.

## Task 9: Add vector PDF export and controlled print workflow

**Files:**
- Create: `src/application/print/export-pdf.ts`, `src/application/print/prepare-print-job.ts`, `src/application/print/print-history.ts`
- Create: `src-tauri/src/adapters/pdf/mod.rs`, `src-tauri/src/adapters/platform_print.rs`
- Create: `src/features/print/ExportDialog.tsx`, `src/features/print/PrintPreview.tsx`
- Create: `src-tauri/src/adapters/pdf/tests/pdf_dimensions.rs`, `tests/application/print-workflow.test.ts`

**Interfaces:**
- Consumes: RenderScene and SVG/sheet output from Task 8.
- Produces: deterministic vector `exportPdf(request): ExportResult`; print preview with physical page dimensions/effective scale; `preparePrintJob(request): PrintJob`; OS handoff adapter that cannot mutate template geometry; append-only print history.

- [ ] **Step 1: Write failing tests** for exact PDF page boxes, vector/text retention, scale/margins, failed export reporting, immutable published output, print job contents, and separation between render and OS handoff.
- [ ] **Step 2: Run `cargo test pdf_dimensions` and `npm run test -- tests/application/print-workflow.test.ts`;** expect failure before the PDF adapter exists.
- [ ] **Step 3: Implement vector PDF conversion** from the canonical render output; screenshot/raster page capture is prohibited.
- [ ] **Step 4: Implement preview/export and print-job handoff** with explicit destination/scale metadata and no printer settings in domain templates.
- [ ] **Step 5: Run focused tests, `cargo test`, `npm run test`, `npm run typecheck`, and `npm run build`;** expect exact dimensions and workflow checks to pass.
- [ ] **Step 6: Compare a synthetic page's PDF dimensions to its declared mm dimensions** and inspect that representative text/shape geometry remains vector.
- [ ] **Step 7: Commit** as `feat(print): add vector PDF export and print history`.

## Task 10: Deliver backup/restore, Windows packaging, and V1 acceptance

**Files:**
- Create: `src/application/backup/backup.ts`, `src/application/backup/restore.ts`, `src/features/settings/BackupRestore.tsx`
- Create: `src-tauri/src/adapters/backup.rs`, `src-tauri/src/packaging/windows.rs`
- Create: `tests/application/backup-restore.test.ts`, `tests/e2e/v1-acceptance.spec.ts`, `docs/ACCEPTANCE_RECORD.md`
- Modify: `README.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/TESTING_STRATEGY.md`, `docs/IMPLEMENTATION_PLAN.md`

**Interfaces:**
- Consumes: all preceding V1 interfaces.
- Produces: integrity-checked backup/restore for SQLite plus assets; portable export/import manifest; upgrade-safe Windows package and first-run local data path; acceptance record tied to actual versions and command output.

- [ ] **Step 1: Write failing tests** for backup/restore hashes and foreign keys, failed restore preserving active data, asset inclusion, fresh install local path, upgrade schema migration, and the end-to-end catalog→edit→publish→SVG/PDF flow.
- [ ] **Step 2: Run focused backup and E2E commands;** expect failures before backup/packaging behavior exists.
- [ ] **Step 3: Implement backup and restore** using a consistent SQLite snapshot, asset manifest, hash verification, temporary restore location, and integrity check before activation.
- [ ] **Step 4: Implement Windows packaging and upgrade-safe data initialization**; do not move data into a synchronized folder.
- [ ] **Step 5: Run `npm run test`, `npm run typecheck`, `npm run build`, `cargo test`, the Windows package command, and the E2E suite.** Record exact results in `docs/ACCEPTANCE_RECORD.md`.
- [ ] **Step 6: Run the private migration acceptance** outside Git: reconcile 145 normalized records, 124 standard Gang rows, five families, stable IDs/provenance, and six exception gates; compare representative physical renders. Keep inputs and row-level reports private.
- [ ] **Step 7: Review docs against shipped interfaces**; search for SQLite/SharePoint contradictions, geometry units, lifecycle names, entity names, unassigned requirements, and vague task language. Run `git diff --check`, verify Markdown links, inspect staged files for private data, and ensure no automatic workflow was introduced.
- [ ] **Step 8: Commit** as `feat(release): complete WVM V1 acceptance and packaging`.

## Execution notes

- The ten tasks replace the original 22-phase outline by grouping work with shared contracts while preserving review gates between domain/storage, catalog/migration, editor geometry/operations, authoring/lifecycle, SVG/sheet rendering, PDF/print, and release/acceptance.
- Do not start Task 1 implementation until the foundation documentation is approved.
- Each task ends with a commit and is independently reviewable. Keep a task's change set limited to its listed files and necessary spec corrections.
- The six composite/special Gang records are never auto-published. The real migration is performed only against operator-selected private files after code review.
- Task 10 is the V1 closeout. SharePoint, MCP, ChatGPT, AI, multi-user services, and automatic GitHub Actions remain out of scope.
