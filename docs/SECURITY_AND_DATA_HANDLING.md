# Security and data handling

## Public repository

The repository is public. Commit only source, documentation, and synthetic test data. Never commit real warehouse datasets, original legacy files, production SQLite databases, private migration reports, company credentials/tokens, employee/customer information, internal URLs or SharePoint paths, or proprietary assets without documented distribution approval. Review staged diffs and binary files before every push.

## Private migration and local data

Migration inputs stay in operator-controlled local paths outside the repository. Import tooling reads only explicitly selected inputs and emits a private manifest/report by default. WVM stores the database, assets, backups, and exports in platform-local application directories with user-only access where the OS supports it. Never put a live SQLite file in a synced/shared location.

## Secrets and configuration

`.env.example` contains variable names and safe defaults only. `.env` files, tokens, passwords, keys, and production paths are excluded. Future integrations use least-privilege scoped credentials in an OS-protected store and never embed secrets in source or logs.

## Backups and generated exports

Backups contain the SQLite database and referenced assets; treat them as operational data, protect access, and validate integrity before restore. Exports may contain warehouse text or logos and must be stored and shared under the same rules as the source data. The app must identify the chosen output path and avoid silently syncing exports to cloud folders.

## Audit and telemetry

AuditEvent is append-only for meaningful content, version, lifecycle, migration, and print-job actions. Avoid recording unnecessary sensitive text in diffs; record field-level changes and references with a minimal-data policy. V1 has no hidden telemetry. Diagnostics stay local unless the user explicitly exports them.

## Dependencies and future integrations

Maintain a dependency/licence register from the first code task. Prefer permissive licences when equivalent; record origin/licence for copied source or substantial borrowed implementation. Future SharePoint/API adapters use approved Microsoft APIs/workflows and least privilege. Future MCP write tools must call application services, enforce user authorization and lifecycle constraints, and require explicit approval policy for consequential changes. No MCP or ChatGPT integration is a V1 runtime dependency.
