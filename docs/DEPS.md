# Rowster — Dependencies

Pinned by lockfiles (`Cargo.lock` for Rust, `package-lock.json` for npm). Version policy: **no bump without a full gate run** (see TESTING.md).

## Rust (`src-tauri/Cargo.toml`)

### Runtime

| Crate | Version | Purpose | Notes |
|---|---|---|---|
| tauri | 2 | Core framework | `features = ["unstable", "devtools", "test"]` — `unstable` is **required** for child webviews; `test` enables the mock-runtime caller-guard tests |
| tauri-build | 2 | Build script | build-dep |
| rusqlite | 0.39 | SQLite | `bundled` (no system dep) |
| reqwest | 0.12 | Favicon fetching | `blocking` + `rustls-tls` (no OpenSSL on Windows/macOS) |
| tokio | 1.53 | Async runtime | rt-multi-thread, macros, sync, time |
| serde / serde_json | 1 / 1.0 | Serialization | |
| thiserror | 2 | Error hierarchy | |
| url | 2.5 | URL parsing/normalization | `Address::resolve`, canonical origins |
| uuid | 1.24 | tab/webview identifiers | v4 + serde |
| log | 0.4 | Facade for tauri-plugin-log | |
| tracing / tracing-subscriber | 0.1 | Structured diagnostics | env-filter |

### Plugins (tauri)

| Plugin | Version |
|---|---|
| clipboard-manager | 2.3.2 |
| dialog | 2.7.2 |
| log | 2.9.0 |
| notification | 2.3.3 |
| opener | 2.5.4 |
| single-instance | 2.4.3 |

### Platform hooks (native progress — **not yet wired**, reserved for post-v1)

| Target | Crate | Version |
|---|---|---|
| Windows | webview2-com | 0.38 |
| Windows | windows-core | 0.61 |
| macOS | objc2 / objc2-web-kit | 0.6 / 0.3 |
| Linux | webkit2gtk | 2 |

## npm (`package.json`)

### Runtime

| Package | Version | Purpose |
|---|---|---|
| react / react-dom | 19.2 | UI |
| @tauri-apps/api | 2.11 | IPC + event bus |
| @tauri-apps/plugin-clipboard-manager | 2.3 | clipboard |
| @astryxdesign/core | 0.2 | design-system components (reset.css + astryx.css) |
| @astryxdesign/theme-neutral | 0.2 | theme seed for `rowsterTheme` |
| @astryxdesign/cli | 0.2 | `astryx theme build` codegen |
| lucide-react | 1.28 | icons |
| @stylexjs/stylex | 0.19 | transitive (Astryx compile) — not used directly |

### Dev

| Package | Version |
|---|---|
| @tauri-apps/cli | 2.11 |
| vite | 6.4 |
| typescript | 5.9 |
| @vitejs/plugin-react | 4.7 |
| @types/{react,react-dom,node} | latest |

## Supply-chain posture

- `npm audit`: **0 vulnerabilities** (as of last gate run; `nanoid` fixed via lockfile refresh in `e2d6a7c`).
- `cargo-audit`: manual step (Phase E); no known advisories at last check.
- Bundled rusqlite (no system SQLite), rustls (no OpenSSL on Windows), no native code from npm (all JS).
- Registry pins: Rust resolves via `Cargo.lock`; CI builds with `--locked`; npm uses the committed `package-lock.json`.