# Warehouse Visual Manager (WVM)

Warehouse Visual Manager replaces editable PowerPoint and Excel files as the working catalog for warehouse signs and stickers. V1 defines structured visual records, reusable layouts, a millimetre-based editor, consistent vector rendering, export, and controlled printing.

## V1 at a glance

- Windows-first local desktop application built with Tauri 2, React/TypeScript, Rust, and SQLite.
- SQLite is the local system of record. A live database must never be opened from a synchronized or shared folder.
- SVG-native editing and rendering use one canonical, versioned document model with physical dimensions stored in millimetres.
- Published versions are immutable; lifecycle is Draft → Review → Published → Retired.
- SharePoint, API hosting, MCP, ChatGPT, and AI features are future adapters or post-V1 scope, not V1 dependencies.

## Status

Foundation documentation stage. Product code has not started.

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
- [Architecture decisions](docs/adr/)

## Data safety

This is a public repository. Real warehouse information, original PowerPoint/Excel sources, production SQLite databases, private migration exports, employee/customer data, credentials, internal URLs, and unapproved company assets must remain outside Git. Only synthetic fixtures and approved public assets may be committed.

## Contributing

Read [AGENTS.md](AGENTS.md) and the canonical docs before implementation. The implementation plan is task-sized and TDD-oriented. Do not add automatic GitHub Actions or merge a pull request without explicit user approval.
