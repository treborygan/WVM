# Warehouse Visual Manager (WVM)

Warehouse Visual Manager replaces editable PowerPoint and Excel files as the working catalog for warehouse signs and stickers. V1 defines structured visual records, reusable layouts, a millimetre-based editor, consistent vector rendering, export, and controlled printing.

## V1 at a glance

- Windows-first local desktop application built with Tauri 2, React/TypeScript, Rust, and SQLite.
- SQLite is the local system of record. A live database must never be opened from a synchronized or shared folder.
- SVG-native editing and rendering use one canonical, versioned document model with physical dimensions stored in millimetres.
- Published versions are immutable; lifecycle is Draft → Review → Published → Retired.
- SharePoint, API hosting, MCP, ChatGPT, and AI features are future adapters or post-V1 scope, not V1 dependencies.

## Current usable release

The Windows desktop preview release provides a local SQLite-backed catalog with search, filters, sorting, paging, record creation/editing/duplication, immutable version history, lifecycle transitions, and a publication gate for special Gang records. It includes synthetic examples for five template families and an SVG canvas editor with millimetre geometry, zoom, pointer move/resize, configurable grid and alignment-guide snapping, text/shape/image insertion and deletion, undo/redo, styling, and visual/brand binding controls. PNG and JPEG images can be imported through the native picker; their bytes are SHA-256 content-addressed under local app data and embedded in canvas/catalog preview and single-artboard SVG export. The interactive canvas, catalog preview, and export resolve the canonical document through one shared render scene. Saving creates a new immutable template version and linked visual draft version atomically. Unsupported text layout, missing assets, and SVG image import are reported; exports are not production print sheets. The branded local MSI build uses the supplied DHL logo and Desktop Delivery fonts after manifest hash checks.

Deterministic multi-copy sheet rendering/PDF output, print handoff, brand/font management, private legacy import UI, and verified backup/restore remain planned. This is an editable local preview release, not a completed V1 production sign-authoring workflow. No real warehouse data is included; the local QA catalog contains synthetic examples only.

## Development

Install the pinned npm dependencies and run the frontend checks from the repository root:

```sh
npm ci
npm run test
npm run typecheck
npm run build
```

Start the desktop development shell with `npm run desktop:dev`. The host must have the [Tauri 2 platform prerequisites](https://v2.tauri.app/start/prerequisites/) installed. Run the Rust gates independently with `cargo test --manifest-path src-tauri/Cargo.toml` and `cargo check --manifest-path src-tauri/Cargo.toml`.

To build a branded local MSI, prepare the user-provided brand pack into the ignored `public/brand-assets/` directory and verify its file hashes:

```powershell
.\scripts\build-local-dhl-release.ps1 -BrandPackPath 'C:\path\to\verified\brand-pack'
```

The script bundles only the DHL screen logo, a warehouse delivery illustration, and the selected Desktop Delivery regular/bold fonts. Those company assets remain excluded from Git; keep the resulting MSI and complete asset pack within the authorized internal use scope. The build is unsigned and requires Windows WebView2 at runtime.

## Canonical documentation

- [Project context](docs/PROJECT_CONTEXT.md)
- [V1 specification](docs/V1_SPEC.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Data model](docs/DATA_MODEL.md)
- [Canvas editor](docs/CANVAS_EDITOR.md)
- [Rendering pipeline](docs/RENDERING_PIPELINE.md)
- [Migration strategy](docs/MIGRATION_STRATEGY.md)
- [Security and data handling](docs/SECURITY_AND_DATA_HANDLING.md)
- [Testing strategy](docs/TESTING_STRATEGY.md)
- [Research adoption](docs/RESEARCH_ADOPTION.md)
- [V1 implementation plan](docs/IMPLEMENTATION_PLAN.md)
- [Dependency and licence register](docs/DEPENDENCIES.md)
- [Architecture decisions](docs/adr/)

## Data safety

This is a public repository. Real warehouse information, original PowerPoint/Excel sources, production SQLite databases, private migration exports, employee/customer data, credentials, internal URLs, and unapproved company assets must remain outside Git. Only synthetic fixtures and approved public assets may be committed.

## Contributing

Read [AGENTS.md](AGENTS.md) and the canonical docs before implementation. The implementation plan is task-sized and TDD-oriented. Do not add automatic GitHub Actions or merge a pull request without explicit user approval.
