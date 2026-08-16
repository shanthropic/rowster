<p align="center">
  <img src="./app-icon.svg" alt="Rowster Logo" width="80" height="80" />
</p>

# Rowster

A privacy-respecting, multi-tab desktop browser built with **Rust + Tauri 2**
and a **React + TypeScript + Astryx** chrome UI.

Rowster runs every tab in its own hidden webview managed by a single Rust
process. Remote content is strictly untrusted: tab webviews have zero
capabilities, cannot invoke commands, and are sandboxed behind a navigation
policy — see [SECURITY.md](./SECURITY.md).

## Features

- Multi-tab browsing with tab strip, context menus, and drag-free keyboard
  focus (roving tabindex)
- Bookmarks (star toggle, toolbar bar, management page)
- Downloads (permission prompt, progress tray, open/reveal, retry/cancel)
- Site permissions (camera, microphone, geolocation, notifications) with a
  per-site settings table
- Find in page (Ctrl+F, case-sensitive toggle, match count)
- Tab sleep/discard and per-tab mute
- New-tab page: live clock, search, and frequently visited sites
- History with search, retention policy, and 90-day frequent-site ranking
- Favicon pipeline (`favicon://` internal protocol, disk cache)
- Session restore, zoom, chrome-local pages (History, Bookmarks, Downloads,
  Settings)

## Architecture

```
React chrome (main webview)          tab webviews (tab-<id>) × N
  ─ state via events only            ─ zero capabilities, no IPC
  ─ commands → Rust (invoke)         ─ navigation policy enforced
        └── Rust core: tabs · session · history · bookmarks · downloads
            permissions · find · favicons · settings · SQLite (WAL)
```

Design details, the milestone plan, and data-flow rules live in
[`rowster_complete_architectural_plan.md`](./rowster_complete_architectural_plan.md).

## Development

Prerequisites: [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/)
(Rust toolchain, and per-OS webview system packages — on Linux:
`libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev
librsvg2-dev patchelf`).

```sh
npm install
npm run tauri:dev        # run the browser
```

### Gates

Every change must keep all of these green (CI runs the same set on
Windows and Linux):

```sh
cd src-tauri && cargo fmt --check
cd src-tauri && cargo clippy --all-targets --locked -- -D warnings
cd src-tauri && cargo test --locked
npm run typecheck
npm run build
```

### Layout

- `src/` — React chrome UI (`App.tsx`, components, pages)
- `src-tauri/src/` — Rust core (`tabs/`, `repos/`, `security/`,
  `permissions.rs`, `find.rs`, `favicons.rs`, `commands.rs`, `app.rs`)
- `src-tauri/tests/` — integration tests (isolation invariants)
- `src-tauri/capabilities/` — capability ACL (`main` only)

## License

MIT
