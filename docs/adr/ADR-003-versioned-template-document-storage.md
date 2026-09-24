# ADR-003: Versioned template document storage

- **Status:** Accepted for V1
- **Context:** The POC `templates` rows identify families but do not fully represent editable layouts. V1 requires atomic editing, undo/redo, immutable versions, and searchable catalog metadata.
- **Decision:** Store stable relational identity/search/lifecycle columns and each immutable TemplateVersion layout as an atomic schema-versioned JSON document. Keep commonly queried visual/template fields relational and validated; use JSON for the cohesive layout document and versioned visual content where appropriate.
- **Alternatives considered:** (1) normalized element rows, which make each layout edit span many SQL rows and complicate coherent undo/version snapshots; (2) one unversioned monolithic JSON field, which weakens history and schema evolution; (3) hybrid identity/search columns plus immutable versioned JSON documents, selected.
- **Consequences:** Document schema versioning and validation are mandatory; searchable values should not be hidden in opaque layout JSON. A complete version is read/written atomically, simplifying draft snapshots, command history, and reproducible rendering.
- **Migration/replacement path:** Add explicit JSON schema migrations and preserve old version snapshots. If query or collaboration needs later justify normalized element projections, add a derived/indexed representation without mutating historical documents.
