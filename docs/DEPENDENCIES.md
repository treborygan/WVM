# Dependency and licence register

Direct application dependencies and development/test dependencies are listed below. Versions are exact in `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock`.

## Direct application dependencies

| Dependency | Pinned version | Purpose | Licence | Classification |
| --- | --- | --- | --- | --- |
| React | 19.3.0 | Render the application shell | MIT | Direct runtime |
| React DOM | 19.3.0 | Mount React into the webview DOM | MIT | Direct runtime |
| `@tauri-apps/api` | 2.11.1 | Typed frontend API boundary for the Tauri host | Apache-2.0 OR MIT | Direct runtime |
| `tauri` | 2.11.6 | Rust desktop application host | Apache-2.0 OR MIT | Direct runtime |
| `rusqlite` | 0.40.2 | Local SQLite persistence with bundled SQLite | MIT | Direct runtime |
| `serde` | 1.0.229 | Serialize adapter records and structured data | Apache-2.0 OR MIT | Direct runtime |
| `serde_json` | 1.0.151 | Persist and validate schema-versioned JSON documents | Apache-2.0 OR MIT | Direct runtime |

## Direct development and test dependencies

| Dependency | Pinned version | Purpose | Licence | Classification |
| --- | --- | --- | --- | --- |
| `@tauri-apps/cli` | 2.11.5 | Run the desktop development/build commands | Apache-2.0 OR MIT | Direct development |
| `tauri-build` | 2.6.3 | Generate Tauri build context from configuration | Apache-2.0 OR MIT | Direct build |
| TypeScript | 7.0.2 | Static type checking | Apache-2.0 | Direct development |
| Vite | 8.3.1 | Frontend development server and production build | MIT | Direct development |
| `@vitejs/plugin-react` | 6.1.1 | React JSX support for Vite and Vitest | MIT | Direct development |
| Vitest | 5.0.1 | Frontend test runner | MIT | Direct test |
| jsdom | 30.1.1 | Browser-like DOM test environment | MIT | Direct test |
| React Testing Library | 16.3.3 | User-facing React render assertions | MIT | Direct test |
| `@testing-library/jest-dom` | 7.0.1 | Accessible DOM matchers | MIT | Direct test |
| `tempfile` | 3.27.0 | Isolated temporary SQLite databases in Rust tests | Apache-2.0 OR MIT | Direct test |
| React type definitions | 19.3.0 | TypeScript declarations for React | MIT | Direct development |
| React DOM type definitions | 19.3.0 | TypeScript declarations for React DOM | MIT | Direct development |

Transitive packages are resolved and pinned by the committed npm and Cargo lockfiles. Their licence metadata must be reviewed before a release distribution.

## Toolchain-provided dependencies

| Tool | Verified version | Purpose | Licence | Classification |
| --- | --- | --- | --- | --- |
| Node.js | 22.22.2 | Execute frontend tooling | MIT | Toolchain-provided |
| npm | 11.4.2 | Resolve packages and run scripts | Artistic-2.0 | Toolchain-provided |
| Rust compiler | 1.98.1 | Compile and test the desktop host | Apache-2.0 OR MIT | Toolchain-provided |
| Cargo | 1.98.1 | Resolve Rust crates and run Rust gates | Apache-2.0 OR MIT | Toolchain-provided |

## Scope boundary

No component library, renderer library, AI package, MCP package, or SharePoint/Microsoft Graph package is included. Local SQLite access is implemented with the bundled SQLite feature of `rusqlite`; application data must stay in the platform-local application-data directory. SharePoint, MCP, and AI remain post-V1 adapters.
