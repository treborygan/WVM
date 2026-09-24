# ADR-001: Local SQLite first

- **Status:** Accepted for V1
- **Context:** The POC migration report proposed SharePoint as production persistence, while the approved V1 direction is a Windows-first local desktop tool. A shared database file would introduce sync, locking, and partial-write risks.
- **Decision:** Local SQLite is V1 authoritative persistence. The database must reside in the platform-local WVM application data directory. Never open a live SQLite database concurrently from SharePoint, OneDrive sync, SMB, Teams libraries, or another shared/synchronized folder. Application code depends on repository interfaces so a future API/SharePoint-backed repository can replace the local adapter without changing domain/editor/rendering contracts.
- **Alternatives considered:** SharePoint List first; PostgreSQL server; synchronized SQLite; direct file-based JSON/Excel; local SQLite behind a repository interface.
- **Consequences:** V1 is single-user/local. Backup/export is explicit. Shared catalog behavior is outside V1. Migration from SQLite to a future service uses repository adapters and controlled synchronization, not file sharing.
- **Migration/replacement path:** Add an approved service adapter that implements repository and asset interfaces, define conflict/version semantics, and import/export through a reviewed migration. Keep local SQLite available for offline use only if synchronization semantics are explicitly designed.
