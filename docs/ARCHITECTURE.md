# Architecture

## System shape

WVM V1 is a local-first Windows desktop app. Tauri 2 hosts React/TypeScript UI and Rust commands/adapters. SQLite is the local system of record. The SVG editor, preview, and export consume one versioned document/render model.

```text
React catalog and editor
          |
Application commands and queries
          |
Domain types, validation, lifecycle rules
          |
Repository, asset, and renderer interfaces
          |
SQLite | local asset store | SVG/PDF renderer | Tauri platform bridge
          |
Future adapters: SharePoint/API and MCP (not V1)
```

## Dependency direction

- UI invokes typed application commands/queries and renders returned view models. It does not issue SQL or encode lifecycle policy.
- Application services orchestrate domain operations and repository/asset/render interfaces.
- Domain types and validation do not import Tauri, SQLite, SharePoint, MCP, or renderer-library types.
- SQLite and filesystem adapters map persisted rows/files to domain contracts.
- Migration is an input adapter that transforms staged legacy evidence to canonical domain records; it is not domain logic.
- Rendering accepts immutable version data and resolves a RenderScene without reading live DOM state. SVG and PDF are generated from that scene.
- Tauri commands validate inputs and delegate to application services; they do not become a second business-rule layer.

## Proposed source tree

```text
src/
  app/                 # routing and application composition
  features/catalog/    # search, filters, details, record actions
  features/editor/     # SVG canvas, inspector, layers, history UI
  features/print/      # export and print-job workflows
  domain/              # entities, document schemas, validation, lifecycle
  application/         # commands, queries, repository interfaces
  rendering/           # scene resolution, SVG, PDF interfaces
src-tauri/
  src/commands/        # narrow Tauri command bridge
  src/adapters/        # SQLite, local assets, platform printing
  migrations/          # numbered SQLite schema migrations
tests/
  domain/ repository/ migration/ rendering/ e2e/
fixtures/synthetic/    # generated, non-operational examples only
tools/migration/       # private-input-capable importer and reconciliation
docs/
```

Implementation may refine filenames while preserving these boundaries and stable interfaces.

## Persistence and local files

SQLite is opened only from the platform-local WVM data directory. Repository interfaces isolate application/domain services from SQL and make a later service-backed repository possible. Asset bytes are kept in the local asset store, deduplicated by content hash; database rows hold metadata and stable locators. Database and asset changes that form one user operation use a defined transaction/compensation boundary.

No live SQLite database may be opened concurrently from SharePoint, OneDrive sync, SMB, Teams document libraries, or any shared/synchronized path. SharePoint/API integration remains a future adapter using approved service APIs/workflows.

## Template and visual data flow

Stable Template and Visual identities reference immutable versions. A TemplateVersion contains a schema-versioned TemplateDocument JSON snapshot; a VisualVersion contains structured variable content, its selected template version, publication metadata, and provenance. Relational searchable fields remain queryable in SQLite; layout geometry remains an atomic versioned document.

```text
TemplateVersion + VisualVersion + BrandProfile + Assets
                         -> binding resolution
                         -> RenderScene (mm geometry)
                         -> SVG
                         -> vector PDF / print handoff
```

Editor preview and exported output share the same scene resolution and SVG rendering logic. Browser DOM layout is not a rendering input.

## Future adapters

SharePoint may later synchronize metadata and approved assets using a supported API/workflow. MCP may later expose approved application capabilities to an agent host. Both remain adapters around application services; neither becomes an internal domain dependency or V1 runtime requirement. See ADR-004 and ADR-005.
