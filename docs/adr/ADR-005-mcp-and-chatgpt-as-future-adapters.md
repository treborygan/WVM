# ADR-005: MCP and ChatGPT as future adapters

- **Status:** Accepted for V1; integrations deferred
- **Context:** WVM capabilities may later be useful to Codex/ChatGPT or another agent host. MCP is an external protocol and must not become internal business architecture.
- **Decision:** No V1 runtime dependency on MCP, ChatGPT, or OpenAI Apps SDK. If approved later, read tools may expose catalog search, published visual/template retrieval, and render preview. Write tools must call WVM application services, enforce authorization and lifecycle validation, and apply an explicit approval policy. MCP remains an adapter over stable application interfaces. Reference examples: https://github.com/openai/openai-apps-sdk-examples
- **Alternatives considered:** MCP as internal service layer; direct model access to SQLite; ChatGPT-hosted UI first; no integration; future adapter over application services.
- **Consequences:** V1 remains fully usable offline without an agent host. Future integration cannot bypass audit, authorization, validation, or publication rules.
- **Migration/replacement path:** Specify a concrete use case, allowed capabilities, identity/approval model, data boundary, and threat review; add the adapter independently and test it against the same application services as the desktop UI.
