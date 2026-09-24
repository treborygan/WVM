# Testing strategy

## Layers and gates

1. **Domain unit tests:** IDs, schema parsing, positive finite geometry, lifecycle transitions, immutable published versions, bindings, and migration exception eligibility.
2. **Document validation tests:** valid/invalid schema versions, duplicate element IDs, unsupported element types, missing required fields, extreme text, and out-of-page rules.
3. **Repository tests:** temporary SQLite databases, foreign keys/indexes, transactional version+pointer+audit writes, rollback on injected failure, and interrupted schema migration.
4. **Migration tests:** synthetic POC-shaped inputs, stable IDs/provenance, family/count/hash reconciliation, malformed rows, and six special exception gates.
5. **Frontend tests:** catalog search/filter states, accessible selection/inspector behavior, editor controls, unsaved changes, diagnostics, and keyboard operation.
6. **Geometry/editor tests:** mm round trips, inverse viewport transforms, drag/resize at 25%, 100%, 400%, snapping, bounds, and deterministic undo/redo.
7. **Renderer tests:** binding resolution, brand asset propagation, normalized SVG golden structure, editor/renderer scene parity, font/asset failures, and exact physical dimensions.
8. **PDF/print tests:** vector preservation, exact PDF page boxes, scale/margin calculations, slot placement for 2-up/3-up/12-up, and handoff request boundaries.
9. **End-to-end desktop tests:** catalog-to-edit-to-publish-to-export workflow using generated synthetic data.
10. **Windows packaging tests:** fresh install, first-run local data directory, upgrade migration, backup/restore, and smoke launch on supported Windows.

Screenshots may supplement visual review but do not prove geometry, rendering parity, migrations, or physical print dimensions.

## Required high-risk cases

- Same intended physical drag/resize produces same mm values at 25%, 100%, and 400% zoom.
- Editing after publish creates a new draft and leaves historical published SVG/PDF unchanged.
- Editor preview and export geometry/content match at RenderScene level.
- Missing assets/fonts and unresolved bindings produce actionable diagnostics or the exact declared fallback.
- The six special Gang exceptions cannot become trusted Published records without recorded manual validation.
- Zero/negative/non-finite dimensions, extreme text, duplicate IDs, corrupted JSON schema versions, interrupted DB migration, and failed restore are handled without data loss.
- Logo replacement updates all dependent current renders without rewriting every visual record.
- Duplicate visual gets a new identity and retains intended content/provenance.
- SVG and PDF page sizes equal the declared physical dimensions; 2-up/3-up/12-up gaps and margins are exact.
- Backup/restore preserves database integrity, versions, assets, and hashes.

Each implementation task specifies its focused command in `IMPLEMENTATION_PLAN.md`. Task 1 establishes scripts; later tasks extend them. Run focused tests first, then the relevant suite and build before committing.
