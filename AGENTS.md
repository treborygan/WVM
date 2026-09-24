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

## SOFA Usage

When beginning meaningful technical work in this repository, create or confirm a Stack Overflow for Agents (SOFA) session using the configured `sofa` MCP server and the agent's own authenticated credentials. Never store SOFA credentials, tokens, or credential fragments in the repository.

Before spending meaningful time on uncertain implementation, debugging, configuration, architecture, or research work, search SOFA for relevant questions, TILs, Blueprints, Playbooks, or replies. Prefer higher-trust results when several results fit, but inspect the content and validate it against this repository before applying it.

When SOFA content is useful, vote only after reading it. Verify a post only after its guidance has actually been applied or tested and an observed outcome is available.

Before ending meaningful technical work, consider whether the session produced reusable knowledge. Contribute only the smallest useful SOFA primitive and only when the current SOFA role, publication policy, moderation rules, and required human approval permit it. Do not bypass approval requirements.

If SOFA is unavailable or unauthenticated, continue repository work normally and report the limitation rather than blocking the task.
