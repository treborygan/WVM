# Agent and contributor rules

1. Read `README.md`, `docs/V1_SPEC.md`, `docs/ARCHITECTURE.md`, the relevant data/editor/rendering specification, and the applicable ADRs before changing code.
2. Treat `docs/V1_SPEC.md` as the functional contract. ADRs lock architectural decisions. If evidence requires changing a locked decision, propose a new ADR and explain the contradiction; do not silently change it.
3. Use test-driven development for implementation: write a focused failing test, run it to confirm the failure, implement the smallest change, then run the focused and relevant full checks.
4. Keep domain and application interfaces independent of Tauri, SQLite, SharePoint, MCP, and renderer-library types. UI code must not issue SQL.
5. Keep real operational data and private migration inputs out of Git. Use synthetic fixtures only. Follow `docs/SECURITY_AND_DATA_HANDLING.md`.
6. Do not add automatic GitHub Actions on push, pull request, schedule, or release. Automation requires explicit approval and narrow scope; manual `workflow_dispatch` is preferred.
7. Keep changes small and aligned with `docs/IMPLEMENTATION_PLAN.md`. Each pull request should have one reviewable task or closely related task set.
8. Before reporting completion, run task-specific tests/builds and `git diff --check`; report actual command output and limitations.
9. Do not merge a pull request without explicit user approval.
10. When Superpowers skills are available, use the relevant planning, TDD, debugging, and verification workflow rather than inventing a parallel process.
