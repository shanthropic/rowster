# Rowster — Dependencies

Dependencies are strictly pinned across lockfiles (`Cargo.lock` for Rust backend dependencies and `package-lock.json` for npm packages).

---

## Rust Dependencies (`src-tauri/Cargo.toml`)

### Runtime Core

| Crate | Version | Purpose | Details |
|---|---|---|---|
| `argon2` | 0.5 | Password Hashing | Argon2id key derivation function for master password hashing |
| `password-hash` | 0.5 | Password Hasher Trait | Password hash generation and verification utilities with `getrandom` |
| `zeroize` | 1.8 | Secure Memory Cleanup | Securely zeroes out in-memory sensitive data upon deallocation |
| `tauri` | 2 | Core Framework | Features: `unstable` (required for child webviews), `devtools`, `test` |
| `tauri-build` | 2 | Build Script Helper | Build-time dependency for Tauri integration |
| `rusqlite` | 0.40 | SQLite Storage | `bundled` feature (no external system SQLite dependency) |
| `reqwest` | 0.12 | Favicon Pipeline | `blocking` and `rustls-tls` features (avoids OpenSSL dependencies) |
| `tokio` | 1.53 | Async Runtime | Multi-threaded runtime with timer, sync, and macro support |
| `serde` / `serde_json` | 1.0 | Serialization | Serialization and deserialization for IPC, database, and JSON models |
| `thiserror` | 2.0 | Error Hierarchy | Structured, strongly-typed error definitions |
| `url` | 2.5 | URL Parsing | Address resolution, scheme verification, and canonical origin derivation |
| `uuid` | 1.24 | Unique Identifiers | Generates v4 UUIDs for tabs and child webviews |
| `log` | 0.4 | Logging Facade | Standard logging facade paired with `tauri-plugin-log` |
| `tracing` / `tracing-subscriber` | 0.1 / 0.3 | Structured Telemetry | Diagnostic tracing with environment filtering support |

### Tauri Plugins

| Plugin | Version | Purpose |
|---|---|---|
| `tauri-plugin-clipboard-manager` | 2.3.2 | System clipboard access |
| `tauri-plugin-dialog` | 2.7.2 | Native file selection and alert dialogs |
| `tauri-plugin-log` | 2.9.0 | File-backed and stdout logging |
| `tauri-plugin-notification` | 2.3.3 | Desktop notification dispatch |
| `tauri-plugin-opener` | 2.5.4 | Secure external URL and file opening |
| `tauri-plugin-single-instance` | 2.4.3 | Enforces single-instance application lifecycle |

### Platform-Specific Dependencies

| Target | Crate | Version | Purpose |
|---|---|---|---|
| Windows | `windows` | 0.61.3 | Windows Hello WinRT biometrics (`Security_Credentials_UI`), WinRT apartments, and atomic file replace |
| Windows | `windows-core` | 0.61 | Windows runtime core types |
| Windows | `webview2-com` | 0.38 | Direct WebView2 COM interface bindings |
| macOS | `objc2` / `objc2-web-kit` | 0.6 / 0.3 | Objective-C and WKWebView bindings |
| Linux | `webkit2gtk` | 2 | WebKitGTK bindings for Linux tab webviews |

---

## Frontend Dependencies (`package.json`)

### Runtime

| Package | Version | Purpose |
|---|---|---|
| `react` / `react-dom` | 19.2 | Frontend chrome UI rendering engine |
| `@tauri-apps/api` | 2.11 | Tauri IPC client and event bus |
| `@tauri-apps/plugin-clipboard-manager` | 2.3 | Frontend clipboard integration |
| `@astryxdesign/core` | 0.3 | Astryx design system components |
| `@astryxdesign/theme-neutral` | 0.3 | Base theme token seed for `rowsterTheme` |
| `@astryxdesign/cli` | 0.3 | Astryx CLI for theme generation |
| `lucide-react` | 1.31 | Desktop interface icon library |
| `@stylexjs/stylex` | 0.19 | Transitive styling compile dependency |

### Development

| Package | Version | Purpose |
|---|---|---|
| `@tauri-apps/cli` | 2.11 | Tauri build, dev, and packaging tooling |
| `vite` | 6.4 | Development server and bundle builder |
| `typescript` | 7.0 | Strict static type checking |
| `@vitejs/plugin-react` | 4.7 | React JSX Fast Refresh plugin for Vite |
| `@types/*` | latest | Type definitions for React, React DOM, and Node.js |

---

## Supply-Chain & Security Posture

- **Vulnerability Scans**: `npm audit` reports 0 vulnerabilities against the production dependency tree.
- **Embedded Libraries**: `rusqlite` is compiled with the `bundled` SQLite source; `reqwest` utilizes `rustls` to avoid OpenSSL supply-chain risks.
- **Reproducible Builds**: All CI builds enforce `--locked` for Cargo and committed `package-lock.json` for npm.