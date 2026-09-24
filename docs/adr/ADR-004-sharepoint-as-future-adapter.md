# ADR-004: SharePoint as a future adapter

- **Status:** Accepted for V1; SharePoint integration deferred
- **Context:** The POC migration report and phase-two notes recommend SharePoint Lists and libraries as production storage. The current V1 instruction instead selects a local-first desktop application and SQLite. The domain must not inherit SharePoint fields or API assumptions.
- **Decision:** SharePoint is not V1 persistence or an implementation target. A future adapter may synchronize visual metadata to a SharePoint List and approved assets to a document library through approved Microsoft APIs/workflows. Domain and application contracts remain independent of SharePoint names, APIs, and availability. Never put live SQLite in a SharePoint/OneDrive-synchronized path.
- **Alternatives considered:** SharePoint as V1 source of truth; direct Graph calls from UI/domain; local SQLite with a future API/synchronization adapter; multi-user server now.
- **Consequences:** V1 requires local backup/restore and is single-user. Shared approvals, synchronization, and conflict resolution require a separately scoped design and security review.
- **Migration/replacement path:** Introduce a service/adapter boundary, define identity mapping, offline/conflict rules, permissions, and asset/version behavior, then record an ADR and migration plan before implementation.
