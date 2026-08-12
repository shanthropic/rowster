# Rowster — Build & Release

## Prerequisites

Rust 1.85+ (edition 2024), Node 20+, and the platform toolchains in [`SETUP.md`](SETUP.md).

## Local development

```powershell
npm install
npm run tauri:dev        # theme pre-build + vite + tauri dev
```

Dev runs use `devCsp` (allows Vite HMR websockets); the production CSP applies to built bundles.

## Gate sequence (must all pass before release)

Run in order; abort on any failure.

```powershell
# 1. Rust
cargo fmt --check
cargo clippy --all-targets --all-features --locked -- -D warnings
cargo test --all-features --locked

# 2. Frontend
npm run theme:build
npm run typecheck
npm run build

# 3. Audit
npm audit
cargo audit        # if cargo-audit installed; see TESTING.md

# 4. Compile + bundle
npx tauri build --release
```

## Bundling

`npx tauri build` produces, per platform:

| Platform | Artifact |
|---|---|
| Windows | NSIS `.exe` installer + portable `.exe` |
| macOS | `.app` / `.dmg` (needs signing for distribution) |
| Linux | `.deb` + `.rpm` + AppImage (needs `linuxdeploy` plugins for appimage) |

Notes:

- Windows updater/signing: publish happens on a signed runner (GitHub Actions `windows-latest` with a code-signing cert); local `--no-bundle` builds are unsigned.
- `tauri.conf.json` `bundle.windows.nsis.installMode` defaults to current-user install (no admin prompt).
- The `unstable` cargo feature is required (child webviews); do not remove it or tab creation breaks.
- Stripping: release profile sets `strip = true`, `lto = "thin"`.

## Versioning

`0.1.0` currently; bump `src-tauri/Cargo.toml`, `package.json`, and `tauri.conf.json` in lockstep for any tagged release (CI releases on tag).

## Publish checklist

1. All four gate groups pass on both CI OSes (Windows + Ubuntu).
2. `cargo audit` clean, `npm audit` 0 vulnerabilities.
3. Manual smoke: new tab, navigate, back/forward, reload, download prompt + open, permission prompt, drag-reorder, session restore after restart, settings persistence.
4. Tag → CI builds → signed installer → upload to release.