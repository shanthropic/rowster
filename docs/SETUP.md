# Rowster — Setup

## Prerequisites (all platforms)

- Rust toolchain ≥ 1.85 (edition 2024) — install via rustup
- Node.js ≥ 20 + npm
- Git

## Windows

1. **WebView2 Runtime** — ships with Windows 11 and is auto-installed on Windows 10 via the Tauri installer. No action needed for most machines.
2. **MSVC build tools** — `rustup toolchain install stable-msvc` + Visual Studio Build Tools with "Desktop development with C++" workload (or run `winget install Microsoft.VisualStudio.2022.BuildTools` and select the C++ workload).
3. Nothing else: `webview2-com` and `windows-core` are vendored Rust bindings, no SDK downloads.

## macOS

1. Xcode Command Line Tools: `xcode-select --install`.
2. WebKit (WKWebView) is system-provided. Builds on macOS 12+ (aarch64 + x86_64).
3. Rust targets: default host target is enough for `npm run tauri:build`; use `rustup target add x86_64-apple-darwin` only for cross-arch release builds.

## Linux (Debian/Ubuntu)

Install WebKitGTK and build deps:

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

For AppImage bundling also: `libfuse2` (or `--appimage-extract-and-run`), and `linuxdeploy` plugins (gtk) if bundling.

> ⚠️ Wayland: child-tab bounds mispositioning (tauri#15656) — run under X11 (XWayland) or enable `linux_compat_mode` in settings, which re-asserts bounds on activation. See [`LIMITATIONS.md`](LIMITATIONS.md).

## Theme

The Astryx theme is generated before every build/dev run:

```powershell
npm run theme:build    # rowsterTheme.ts -> src/theme/rowster.css
```

Commit `src/theme/rowster.css` when the theme source changes. Both `vite.config.ts` and `tauri.conf.json` carry the production CSP (`frame-src`, `img-src favicon:`, `connect-src` policies); keep them in sync.

## Data locations

- App data dir (Windows): `%APPDATA%\com.rowster.app\` — `rowster.db`, `session.json`, `favicons/`, logs.
- Logs: `tauri-plugin-log` writes `rowster.log` into the app-data dir; `RUST_LOG=rowster=trace` for verbose tracing in dev.