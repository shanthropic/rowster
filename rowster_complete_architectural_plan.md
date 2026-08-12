# ROWSTER — Complete Architectural Plan
### A native multi-tab web browser · Rust + Tauri 2.11 · Astryx chrome UI

**Priorities (descending):** Security → Correctness → Stability → Maintainability → Cross-platform → Performance → Features → Visual polish.

---

## 1. Executive summary

Rowster is a desktop browser where **Rust owns all canonical browser state** and each tab is a **real native webview** (WebView2 / WKWebView / WebKitGTK) created as a *child webview* inside a frameless window whose full-window *main webview* renders the trusted browser chrome (React 19 + TypeScript + Astryx design system). Chrome and tabs are strictly isolated: tab webviews get **zero Tauri capabilities**, remote-domain IPC is denied by Tauri defaults plus defense-in-depth caller checks, and all state flows native-webview-hooks → Rust → chrome via a typed event system.

Verified against **Tauri 2.11.5 / wry 0.55.1 / tao 0.35.3** (docs.rs, July 2026). The multi-webview API is gated behind tauri's `unstable` cargo feature — isolated behind our own module with a documented migration path.

---

## 2. Verified platform research (Tauri 2.11.5)

| Capability | Status | Verified API |
|---|---|---|
| Child webviews per window | ✅ | `Window::add_child(WebviewBuilder, LogicalPosition, Size)`; `Webview::{show, hide, set_bounds, set_position, set_size, set_focus, close, reparent, navigate, reload, eval, eval_with_callback, set_zoom, clear_all_browsing_data, with_webview}` — all `desktop`-gated. **Requires `unstable` feature.** |
| Downloads | ✅ core | `WebviewBuilder::on_download` → `DownloadEvent::{Requested{url, destination:&mut PathBuf}, Finished{url, path, success}}`; return `false` to cancel. No progress in core → platform hooks. |
| New windows / popups | ✅ | `on_new_window(Url, NewWindowFeatures) → NewWindowResponse::{Allow, Create{window}, Deny}` |
| Title / page-load | ✅ | `on_document_title_changed`, `on_page_load` (`Started`/`Finished` only — **no failure variant**) |
| Navigation policy | ✅ | `on_navigation(Fn(&Url) -> bool)` |
| Back/forward | ⚠️ | **Not exposed** on `Webview` in 2.11.5 → own per-tab `NavigationLog` + `eval("history.go(±n)")`; `can_go_back/forward` from the log. |
| Zoom | ✅ | `Webview::set_zoom(f64)` (macOS 11+) |
| Platform escape hatch | ✅ | `Webview::with_webview` → `controller()` (Windows, webview2-com), `inner()` (WKWebView / WebKitGTK WebView), `ns_window()` (macOS) |
| Browser data clearing | ✅ | `clear_all_browsing_data()` + cookie APIs (Windows: async-only, deadlock in sync context) |
| Find in page | ⚠️ | macOS `WKWebView.find(_:)`; Linux `find_controller`; Windows: `window.find()` JS (native `Find` API when runtime ≥130) |
| Permissions | ⚠️ | Win: `PermissionRequested` + persisted per-origin states. Linux: WebKitGTK `permission-request`. macOS: no public handler API → **camera/mic denied by default in v1; notifications unsupported by WKWebView** (both documented). |
| Shortcuts while page focused | ⚠️ | macOS: native menu accelerators (app-wide). Windows: WebView2 `AcceleratorKeyPressed`. Linux: GTK `key-press-event`. |
| Page context menus | ⚠️ | Win: `ContextMenuRequested` (rich). Linux: `context-menu` signal. macOS: **JS `contextmenu` interception** (no public API). |
| Background throttling / tab sleep | ⚠️ | macOS-14-only → implement **own discard** (capture scroll via `eval`, destroy webview, restore on activate). |
| Hard reload | ⚠️ | macOS `reloadFromOrigin`; Linux `reload_bypass_cache`; Windows falls back to `reload()` (documented). |
| Linux child webview positioning | ⚠️ **RISK** | Open bug tauri#15656: wrong bounds on **Wayland + WebKitGTK 2.52**. Mitigation below (§21). |

---

## 3. System architecture

```
┌──────────────────────────── Browser Window ("main", frameless — single window) ─────────────────────┐
│  MAIN WEBVIEW (label = "main") — full window — TRUSTED, has capabilities                           │
│  React 19 + TS + Astryx (tokens only, no hand-rolled CSS, no raw <div> layout)                    │
│  ├ TitleBar (custom window controls; macOS: native traffic lights via titleBarStyle Overlay)     │
│  ├ TabStrip (drag-drop reorder, pin, mute, spinner, favicon, audio dot, overflow menu)            │
│  ├ Toolbar (back/forward/reload-stop/home, address bar w/ security state, menu, bookmarks btn)   │
│  ├ BookmarkBar (toggleable)                                                                       │
│  ├ NEW-TAB OVERLAY (trusted page: search, frequent, recent, closed tabs, bookmarks, background) │
│  ├ Internal pages (History · Bookmarks · Downloads · Settings — chrome-local views)               │
│  └ StatusBar (downloads tray, permission prompts, load errors)                                    │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
      ▲ child webviews (positioned below chrome, Z-above main, hidden when inactive)
│  "tab-{id}" × N  — UNTRUSTED, ZERO capabilities, devtools off in release
      │   on_page_load / on_navigation / on_new_window / on_download / on_document_title_changed
      │   + init script (favicon, audio, scroll, form-dirty heuristics — no IPC)
      ▼
┌────────────────────────────── Rust core (single process, authoritative) ─────────────────────────┐
│ app::Builder ─ plugins(log, dialog, opener, notification, clipboard, single-instance)            │
│   + favicon:// protocol + native menu (macOS) + setup (db → settings → session restore → window) │
│ tabs::TabManager · session · history · bookmarks · downloads                                      │
│ permissions::Broker · settings · address · security::{NavPolicy, CallerGuard} · layout           │
│ native bindings live in webview/handle.rs (with_webview), find.rs, permissions.rs, downloads.rs  │
│ (cfg-gated) — there is NO platform/ module; multi-window is planned, not yet implemented         │
│ db (rusqlite, WAL, user_version) · session.json (atomic, debounced) · app_data dir               │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Process model:** one process. The chrome webview runs the frontend; tab webviews run remote content; both share the webview engine's process model. Rust is the single authority for: tab/window lists, URLs, titles, loading, nav logs, zoom, downloads, permissions, session.

**Data flow rules:**
1. Native webview hooks (`on_page_load`, `on_document_title_changed`, …) → Rust state mutation → `emit_to("main", event)`.
2. Chrome → Rust only via typed commands (`invoke`), every payload validated.
3. Rust → Chrome events are the *only* way the UI learns state; the UI holds no authoritative browser state (only UI-local state like menus, dialogs, drag state).
4. Tab webviews can neither invoke commands (no capabilities + remote-domain IPC blocked) nor receive our events (label-scoped emit).
5. No state mutation inside UI command handlers that requires DB queries inline — all persistence goes through repository modules.

---

## 4. Project structure

```
Rowster/
├─ package.json / package-lock.json      # vite 6, react 19, ts 5, astryx, @tauri-apps/api
├─ vite.config.ts · tsconfig.json · index.html
├─ src/                                  # TRUSTED chrome frontend
│  ├─ main.tsx                           # astryx reset.css + astryx.css + codegen rowsterTheme, Theme provider
│  ├─ App.tsx                            # window layout shell (titlebar/tabstrip/toolbar/content)
│  ├─ state.ts                           # useSyncExternalStore store fed by typed events
│  ├─ ipc.ts                             # typed event bus (EV_* constants) + invoke wrappers (mirror of Rust types)
│  ├─ theme/rowsterTheme.ts              # codegen theme (npm run theme:build)
│  ├─ components/  TitleBar, TabStrip, Tab (dnd), Toolbar, AddressBar, SecurityIndicator,
│  │               BookmarkBar, StatusBar, TabContextMenu, OverlayMenu, Favicon,
│  │               DownloadTray, PermissionPrompt, CertInterstitial, ErrorPage
│  ├─ pages/       NewTab, History, Bookmarks, Downloads, Settings
│  └─ styles/      chrome.css (tokens only — var(--color-*|--spacing-*|--radius-*))
├─ src-tauri/
│  ├─ Cargo.toml                         # tauri 2.11 {unstable,devtools} + plugins + platform crates
│  ├─ tauri.conf.json                    # frameless window, strict CSP, bundle config
│  ├─ capabilities/main.json             # ONLY chrome webview "main" (webviews:["main"]) — no tab capability file
│  ├─ icons/                             # generated via `npx tauri icon`
│  ├─ src/
│  │  ├─ main.rs → lib.rs                # Builder: plugins, protocol, menu, setup, invoke_handler
│  │  ├─ error.rs                        # thiserror hierarchy (Error → user message + log)
│  │  ├─ state.rs                        # AppState { Mutex<Browser>, handles, channels }
│  │  ├─ model.rs                        # Tab, BrowserWindow, NavEntry, Download, … (serde)
│  │  ├─ address.rs                      # URL/search detection + normalization (+tests)
│  │  ├─ security/mod.rs, nav_policy.rs, caller.rs   # scheme filters, caller-label guard (+tests)
│  │  ├─ layout.rs                       # content-rect computation (+tests)
│  │  ├─ events.rs                       # Event enum + emit helpers (typed)
│  │  ├─ commands.rs                     # all #[tauri::command] handlers (thin, delegate)
│  │  ├─ tabs/manager.rs · tab.rs        # TabManager over mockable WebviewHandle trait (+tests)
│  │  ├─ navlog.rs                       # per-tab navigation log (+tests)
│  │  ├─ webview/mod.rs · handle.rs      # create_tab_webview, WebviewHandle + Mock (+tests)
│  │  ├─ (multi-window planned — not yet implemented; single "main" window only)                     │
│  │  ├─ session.rs                      # atomic JSON persistence, debounce, recovery (+tests)
│  │  ├─ db/mod.rs · db/migrations.rs    # rusqlite WAL, user_version (+tests)
│  │  ├─ repos/{history,bookmarks,downloads,permissions,settings}.rs
│  │  ├─ settings.rs                     # Settings + validation (+tests)
│  │  ├─ downloads.rs                    # DownloadManager state machine (+tests)
│  │  ├─ permissions.rs                  # PermissionBroker (+tests)
│  │  ├─ favicons.rs                     # fetch+resize+cache via favicon:// protocol
│  │  ├─ menu.rs · shortcuts.rs
│  │  └─ (native bindings live in webview/handle.rs · find.rs · permissions.rs · downloads.rs)     │
│  └─ tests/ (integration, security)
├─ e2e/                                  # tauri-driver WebDriver smoke tests (CI)
├─ .github/workflows/ci.yml              # matrix: windows/macos/ubuntu
└─ docs/  ARCHITECTURE.md SECURITY.md CAPABILITY_MATRIX.md DATA_MODEL.md
         TESTING.md BUILD_RELEASE.md SETUP.md LIMITATIONS.md READINESS.md DEPS.md
```

---

## 5. Data model

**Rust (serde, stable IDs via `u64`):**
```rust
Tab        { id: TabId(u64), webview_label: String, url: Url, title: String,
             favicon_url: Option<String>, loading: bool, nav_log: NavigationLog,
             zoom: f64, muted: bool, audio_playing: bool, pinned: bool,
             discarded: bool, scroll_y: f64, has_form_data: bool,
             created_at, last_access, find_state }
BrowserWindow { id: WindowId(u64), label: String, tabs: Vec<Tab>, active: usize,
                chrome_height: f64, is_fullscreen: bool, window: Option<Window> }
Browser    { windows: Vec<BrowserWindow>, active_window: usize,
             recently_closed: VecDeque<ClosedTab> (cap 25) }
Download   { id: i64, tab_id: Option<i64>, url, filename, path, mime, total_bytes: Option<u64>,
             received_bytes: u64, status: "requested"|"active"|"completed"|"cancelled"|"failed",
             error: Option<String>, created_at, finished_at }
SitePermission { origin: String, kind: PermissionKind, decision: AllowOnce|AlwaysAllow|Block }
Settings   { search_engine: Custom(String), home_page: String, new_tab_behavior,
             restore_session: bool, ask_before_download, download_dir, theme,
             sync_system_theme, zoom_default, tab_sleep_after_minutes,
             history_retention_days, hardware_acceleration, show_bookmark_bar,
             language, close_last_tab_action, warn_on_form_tabs }
```

**SQLite schema (`rowster.db`, WAL, `PRAGMA user_version` migrations):**
```sql
history(id INTEGER PK, url TEXT, title TEXT, visit_time INTEGER, domain TEXT) + idx(domain, visit_time)
bookmarks(id PK, parent_id FK NULL, title, url NULL, position, created_at)
downloads(id PK, tab_id, url, filename, path, mime, total_bytes, received_bytes, status, created_at, finished_at)
site_permissions(origin TEXT, kind TEXT, decision TEXT, PRIMARY KEY(origin, kind))
settings(key TEXT PK, value TEXT)   -- JSON-serialized Settings blob under 'app'
```

**`session.json`** (separate, versioned `v1`): `{ version, windows: [{ id, bounds, active_tab, tabs: [{url,title,pinned,muted,zoom,scroll_y,navlog,discarded}] }], recently_closed: [...] }`. Atomic write: `session.json.tmp` → `fs::rename`; `.bak` rotation; debounced (1.5 s) + flush on quit; crash recovery: ignore stray `.tmp`, validate version, fall back to `.bak`.

---

## 6. State & concurrency

- `AppState`: single `std::sync::Mutex<Browser>` + `AppHandle` clones + `mpsc::Sender` for background work. Critical sections are microseconds (pure struct mutation); **all webview calls happen after cloning handles out of the lock**.
- **All commands are `async`** (WebView2 sync-command deadlock rule). DB work via `tokio::task::spawn_blocking`. No lock held across `.await`.
- Event handlers (main thread) mutate state then `emit_to`. A **generation counter** per window and per tab prevents stale events (a late page-load event for a closed tab is dropped by id lookup).
- Background tasks (session debounce, tab-sleep sweeper, download progress, audio poll) via `tokio::spawn` + `JoinSet` + `CancellationToken` (rust-async-patterns guidance: channels over shared state; no blocking; select!).
- Single-threaded writes to SQLite (one `Connection` in a `Mutex`, `spawn_blocking`), WAL mode.

---

## 7. Tab lifecycle

```
NewTab ──lazy──► NoWebview (metadata only)
   │ first activation                        sleep timer / memory pressure
   ▼                                          ▼
Discarded ◄─────────── Sleep(30m|mem) ──► Active(webview created, bounds set, shown, focused)
   │ restore                                  │ switch away
   └─────────► Active …                       ▼
                              Inactive(webview alive, hidden, throttled by engine)
   Close(tab) ──► save recently_closed ──► destroy webview ──► remove from vec
```
- **Lazy creation**: webview created on first activation (or on navigate).
- **Switch**: `hide(old)` + `set_bounds(new)` (re-assert on Linux) + `show(new)` + `set_focus(new)` — never recreate.
- **Close**: active-tab close → activate right neighbor (Chrome rule), left if last. Final tab → per settings (blank tab | close window).
- **Duplicate**: new tab with same url/title/zoom/navlog; new webview (fresh) — page state not duplicated (matches Chrome).
- **Sleep (discard)**: capture scroll via `eval` + form-dirty via JS probe, destroy webview, mark `discarded`; restore = create webview + navigate to last URL + `window.scrollTo` + reload-with-form-state note. Pinned tabs exempt. Configurable (default: off / 30 min), memory-pressure aware.
- **Pin**: unpinned window-relative ordering (pinned cluster left, non-reorderable).
- **Mute**: `eval` on all `<audio>/<video>` of that tab (engine-side mute flag not exposed cross-platform — documented heuristic).
- **Reorder**: frontend dnd → `tab_reorder(from, to)` → Rust reorders vec + emits `tabs_snapshot` (session saved).
- Tab state machine is unit-tested against a `MockWebviewHandle` — no real webview required.

---

## 8. Webview lifecycle & layout

- **Chrome = main webview**, full-window, `auto_resize`. Tab webviews = children at logical coords.
- **`layout.rs` (single source of truth):** content rect = `window.inner_size()` − (0, chrome_height). Chrome reports its own height via ResizeObserver → debounced `chrome_layout_changed` command (50 ms). Rust recomputes on `WindowEvent::{Resized, ScaleFactorChanged, Moved}` and after fullscreen toggles. All webviews repositioned through one `apply_layout(window)` path.
- Creation options per tab webview: `initialization_script` (origin-guarded helpers), `devtools(false)` in release, `background_color` = surface token, `zoom_hotkeys_enabled(false)` (we own zoom), `on_page_load/on_navigation/on_new_window/on_download/on_document_title_changed` handlers wired to the manager.
- Destroy = `webview.close()` + remove label from map + log.
- **Fullscreen:** F11 → `window.set_fullscreen` + chrome auto-hides chrome regions; content element fullscreen is handled natively by the engine.
- **Single window (v1):** one `main` window holds the chrome webview + all tab children (`model.rs`: `MAIN_WINDOW_ID = 1`). Multi-window is planned but not yet implemented; `reparent` between windows remains future work (unstable API).

---

## 9. Navigation pipeline & address bar

`address_submit(input)` in Rust:
1. Trim; empty → focus restore.
2. **Search-vs-URL detection** (`address.rs`, unit-tested): has scheme `http(s)://` → URL; contains no-dot bare word, or whitespace, or non-URL pattern → search query via active engine template; dot-containing tokens → URL candidate (normalize).
3. **Normalization**: lowercase host, punycode (IDNA), strip default port, encode spaces, default `https://` (HTTPS preference), strip trailing `#`.
4. **Nav policy** (`security::NavPolicy`, unit-tested): reject `file://`, `chrome://`, `tauri://`, `about:` (except `about:blank`), `favicon://`, internal labels, `javascript:`/`data:` in address input; invalid URL → friendly search + toast (`friendly_invalid`).
5. `on_navigation` in webviews applies the same policy (blocks scripted navigations too).
6. Back/forward: nav log `push(url)` dedupes redirects (page-load events), `go_back/go_forward` = `eval history.go(±n)`; UI state from log index.
7. **Failure surfaces**: load-failure is surfaced by the engine's own error page (documented per-platform) → ErrorPage overlay. **Cert-error interstitial is NOT yet implemented** (planned): the Rust core currently has no certificate-handling path; until added, cert errors fall back to the engine default and are never auto-bypassed. Tracked as future work.
8. **Copy/paste URL** via clipboard plugin; "paste and navigate" and "open copied URL in new tab" toolbar actions.

---

## 10. Event system (Rust → chrome, `emit_to("main")`)

| Event | Payload |
|---|---|
| `tabs_snapshot` | full `BrowserSnapshot` (on connect + after every structural change) |
| `tab_created` / `tab_closed` / `tab_activated` | `TabInfo` |
| `url_changed` / `title_changed` / `favicon_changed` | `{ id, value }` |
| `loading_changed` | `{ id, loading }` |
| `nav_state_changed` | `{ id, can_go_back, can_go_forward }` |
| `zoom_changed` | `{ id, zoom }` |
| `settings_changed` | `Settings` |
| `bookmarks_changed` | `()` (re-query bookmarks) |
| `download_requested` | `{ id, tab_id, url, filename }` (ask-before prompt) |
| `download_started` / `download_completed` / `download_failed` / `download_cancelled` | `Download` |
| `download_open_confirm` | `{ id, path, filename }` (executable open gate) |
| `permission_requested` | `{ origin, kind }` (→ chrome prompt) |
| `find_status` | `{ active, query, count, index }` |

All events are emitted only to the `main` webview via `events::emit_to_chrome` (tab webviews hold no capabilities and cannot subscribe).

Anti-race rules: events carry `window_id + tab_id`; handlers in the frontend ignore events not matching the current snapshot's window; Rust drops events for unknown ids. No event carries secrets or auth data.

---

## 11. Command surface (chrome → Rust, all caller-guarded)

- **Tabs:** `tab_create`, `tab_activate`, `tab_close`, `tab_close_others`, `tab_close_right`, `tab_duplicate`, `tab_reorder`, `tab_mute`, `tab_discard`, `reopen_closed`
- **Navigation:** `navigate`, `go_back`, `go_forward`, `reload`, `hard_reload`, `stop`, `set_zoom`, `zoom_in`, `zoom_out`, `zoom_reset`
- **Window/layout:** `chrome_layout_changed(rect)`, `chrome_overlay_changed(open)` — window controls use Tauri core capabilities (no custom window commands); single `main` window only
- **Downloads:** `downloads_list`, `download_respond(id, allow)`, `download_cancel`, `download_retry`, `download_open`, `download_open_confirm`, `download_reveal`, `download_clear`
- **Bookmarks:** `bookmarks_list`, `bookmark_toggle(url,title)`, `bookmark_edit`, `bookmark_delete`, `bookmark_status`
- **History:** `history_query`, `history_frequent`, `history_delete`, `history_clear`
- **Permissions:** `permission_respond`, `permissions_list`, `permission_reset`, `permission_reset_all`
- **Settings:** `settings_get`, `settings_set(patch)`, `clear_browsing_data(kinds)`
- **Find:** `find_start`, `find_next`, `find_prev`, `find_close`
- **Session/chrome pages:** `startup_info`, `recently_closed_list`, `show_chrome_page(page)`

---

## 12. Security architecture (threat model: every remote site is hostile)

1. **Capability allowlist (least privilege):** `capabilities/main.json` grants plugins/core only to `webviews: ["main"]` (Tauri 2 schema key is `webviews`, not `windows`). **No capability file matches `tab-*`** → tab webviews cannot call core/plugin commands. Unit test asserts this by scanning capability JSON.
2. **Remote-domain IPC denied by Tauri defaults**; no `dangerousRemoteDomainIpcAccess`. Custom commands additionally guard: `caller = webview.label()`, must equal `"main"` (defense in depth, unit-tested via `security::caller::assert_chrome`).
3. **Chrome CSP** (`tauri.conf.json`): `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: favicon://; connect-src ipc: http://ipc.localhost; font-src 'self' data:`. No remote origins, no `unsafe-eval`.
4. **Nav policy** in both address pipeline and `on_navigation` (tab webviews): block `file:`, `chrome:`, `tauri:`, internal, `about:` ≠ blank; `mailto:`/`tel:` → external handler.
5. **No secrets/privileged paths in frontend JS**; data dir paths never cross into tab webviews.
6. **Paths**: every filename sanitized (reject separators/`..`/absolute, Windows-illegal chars), duplicate → `name (1).ext`; download destinations always inside configured download dir; reveal/open via `tauri-plugin-opener` only.
7. **TLS never bypassed silently**: cert handling is documented in §9 (failure surfaces); logs record origin + error kind, never credentials.
8. **Isolation invariant tests** (e2e): a remote test page that calls `invoke("settings_get")` gets a rejection.
9. `SECURITY.md` documents boundary, threats, mitigations, and the invariant list.

---

## 13. Persistence layer

- `db/mod.rs`: open `rowster.db` (app_data_dir), `PRAGMA journal_mode=WAL`, `user_version`-driven `migrations.rs` (array of `(version, sql)`, transactional), corruption handling: open failure → rename aside + recreate + log; every repo function pure `fn(&Connection) -> Result<…>`; **no SQL in command handlers**.
- `session.rs`: atomic JSON (temp+rename), debounce 1.5 s + flush on `RunEvent::ExitRequested`, versioned, `.bak` rotation, recovery on corrupt (validate JSON schema; fall back .bak; else fresh).
- `settings.rs`: typed struct, serde-validated, stored as JSON row; `settings_set` validates every field (enums, ranges, URL validity) before persisting; `settings_changed` event.
- Repos: history (bounded queries, indexes, date-grouped queries), bookmarks (tree via parent_id, dedup on add, import/export HTML), downloads, permissions.
- **Debounced/background**: session save, favicon cache writes, history inserts (batch via channel to avoid blocking tab lifecycle).

---

## 14. Downloads subsystem

- **Core**: `on_download` hook → `DownloadManager::on_requested(url, tab)` → sanitize filename → destination = `download_dir / safe_name` (duplicate handling) → return `true`; `on_finished` → record + notification + `download_completed/failed`.
- **Ask-before-download**: Windows — deferred `DownloadStarting` decision via platform hook + chrome dialog (true pre-start). macOS/Linux — start then offer "Cancel" in the download tray (documented).
- **Progress**: Windows `DownloadStarting`→`BytesReceivedChanged` (bytes, speed, ETA); Linux `WebKitDownload` properties; macOS indeterminate `ProgressBar` (documented).
- **Pause/resume: unsupported by engines — documented.** Cancel: platform cancel (WebView2/WKDownload cancel; WebKit `webkit_download_cancel`). Retry: re-queue same URL through the pipeline.
- **Safety**: never auto-execute; `download_open` asks nothing but opens with default app via opener plugin (with `ask` for executables — never execute: opening a file ≠ executing; `.exe`/scripts get a warning dialog), `download_reveal` via `opener reveal_item_in_dir`.
- DB records + UI: Downloads page (List/Item rows + ProgressBar + speed/ETA + actions), StatusBar tray, notification on complete.

---

## 15. Permissions subsystem

`PermissionBroker::decide(origin, kind, tab, window) -> Decision`:
1. Site-specific stored decision (`site_permissions`) → apply.
2. Else default policy (all deny by default) → `permission_requested` event → chrome `PermissionPrompt` (Astryx Dialog) with **Allow once / Always allow / Block** → decision applied to the engine + persisted for always/block.
- **Platform application**: Windows `PermissionRequested` (state + `SetPermissionState` persist); Linux `permission-request` reply; macOS camera/mic → engine default (deny), documented; notifications unsupported on macOS (WebKit), documented.
- **Settings page**: per-site table with reset; "Reset all site permissions".
- Unit tests: decision precedence (stored > default > prompt), allow-once not persisted, block persists.

---

## 16. Settings subsystem (validated)

Sections (chrome Settings page, Astryx `settings-sidebar` template):
Search engine (presets + custom template) · Home page · New-tab behavior (new_tab_page|home|blank) · Startup (restore session | open home | blank) · Download location + ask-before · Appearance (theme: system/light/dark via codegen `rowsterTheme` + system sync via `matchMedia`; zoom default) · Privacy (history retention, clear browsing data incl. cookies/cache via `clear_all_browsing_data`, search suggestions off) · Tabs (tab sleeping, close-last-tab action, warn on unsaved forms) · Permissions (per-site table) · Language (chrome i18n; engine locale untouched — documented) · Proxy (per-webview `proxy_url`; macOS 14+ w/ `macos-proxy` feature) · Advanced (hardware acceleration note, devtools in dev builds) · Keyboard shortcuts reference.

---

## 17. Shortcuts & menus

**Platform shortcut strategy** (all route to the same `ShortcutAction` enum → TabManager):
- macOS: native menu bar (File/Edit/View/History/Bookmarks/Tools/Help) with accelerators — app-wide by OS.
- Windows: WebView2 `AcceleratorKeyPressed` on each tab webview + chrome JS `useHotkeys` when chrome focused.
- Linux: GTK `key-press-event` on each tab webview widget + chrome JS.
- Chrome-focused: `useHotkeys` (Astryx hook, skips typing targets).

**Shortcut map:** `Ctrl+T` new tab · `Ctrl+W` close · `Ctrl+Shift+T` reopen · `Ctrl+Tab`/`Ctrl+Shift+Tab` next/prev · `Ctrl+1..8`/`Ctrl+9` select/last · `Ctrl+L`/`Alt+D` address · `Ctrl+R`/`Ctrl+Shift+R` reload/hard · `Esc` stop · `Alt+←/→` (Cmd+←/→ mac) back/forward · `Ctrl+F` find · `Ctrl+H` history · `Ctrl+J` downloads · `Ctrl+Shift+O` bookmarks · `Ctrl+B` bookmark bar · `Ctrl+,` settings · `Ctrl+=/-/0` zoom · `F11` fullscreen · `Ctrl+Shift+I` devtools (dev) · `Ctrl+N` new window · `Ctrl+Shift+W` close window · `Ctrl+Shift+D` duplicate · `Ctrl+M` mute · `Ctrl+K` command palette (Astryx CommandPalette).

**Context menus:** tabs (frontend Astryx ContextMenu: new tab, reload, duplicate, pin, mute, close, close others, close right, copy URL) · web pages (platform: Win `ContextMenuRequested` rich data; Linux signal; macOS JS interception → Astryx ContextMenu at cursor; actions: back/forward/reload, open link in new tab/background tab, copy link, copy image address, save image via download pipeline, search selected, copy/paste when editable, inspect in dev) · downloads/bookmarks rows · menu bar button (Win/Linux chrome dropdown; macOS native).

---

## 18. Platform capability matrix (v1 scope)

| Feature | Windows | macOS | Linux |
|---|---|---|---|
| Multi-tab child webviews | ✅ | ✅ | ✅ (X11); ⚠️ Wayland bounds bug → re-assert on activation + fallback mode (§21) |
| Download decide/cancel/finished | ✅ | ✅ | ✅ |
| Download progress (bytes/speed/ETA) | ✅ native | ⚠️ indeterminate | ✅ native |
| Pause/resume | ❌ (documented) | ❌ | ❌ |
| Find in page | ✅ JS (`window.find`) | ✅ native | ✅ native |
| Hard reload | ⚠️ = normal reload | ✅ | ✅ |
| Load-failure → custom error page | ✅ | ⚠️ engine page | ✅ |
| Cert interstitial (explicit, never silent) | ⚠️ planned (not yet implemented) | ⚠️ planned | ⚠️ planned |
| Camera/mic/location/notifications perms | ✅ | ⚠️ denied by default (no handler API); notifications ❌ | ✅ |
| Shortcuts while page focused | ✅ native event | ✅ menu | ✅ GTK event |
| Page context menus | ✅ native | ⚠️ JS interception | ✅ native |
| Audio indicator | ✅ native + JS | ✅ JS | ✅ JS |
| Tab sleeping (discard) | ✅ own impl | ✅ own impl (+throttle) | ✅ own impl |
| Background throttling | ❌ engine | ✅ 14+ | ❌ engine |
| External-protocol links | ✅ | ✅ | ✅ |
| Proxy | ✅ | ⚠️ macOS 14+ | ✅ |
| Feature detection at startup | ✅ `platform::capabilities()` → log + degrade |

---

## 19. Frontend architecture (Astryx component map)

- **State**: single `store.ts` (useSyncExternalStore) fed by event listeners; view components derive. UI-local state (drag, open menus, dialog visibility) stays in React.
- **Theme**: `theme-neutral` built artifacts (`/built` + `theme.css`), `<Theme theme={neutralTheme}>`; system sync via `matchMedia` listener + settings; chrome background = tokens; `prefers-reduced-motion` respected.
- **Astryx map** (discovered via `astryx build/search`; workflow per AGENTS.md — `astryx build` first, then `template`, then `component`):
  - Layout: `AppShell`-like vertical stack (VStack/HStack/StackItem), `Toolbar` (size propagates to all inner controls — used for nav row), `Divider`.
  - Tab strip: custom (browser tabs ≠ TabList semantics) using `useListFocus` (roving tabindex, arrow keys), `StatusDot` for audio/loading, `IconButton`, `MoreMenu` for overflow, `Kbd` hints, `useKeyboardHint` first-focus coaching; drag-reorder with pointer events (no lib).
  - Toolbar: `Toolbar` + `IconButton` (back/forward/reload-stop/home), `InputGroup` (address bar + security `IconButton`), `Spinner`, `DropdownMenu`/`MoreMenu` (browser menu), `Tooltip` everywhere on icons.
  - Overlays: `ContextMenu` (tabs/rows), `Dialog`/`AlertDialog` (close-tab-warning, permission prompt, cert interstitial, delete confirmations), `Popover` (downloads tray, bookmark editor), `CommandPalette` (Ctrl+K), `Toast`+`useToast` (downloads, errors), `Banner` (settings validation errors, offline).
  - Pages: History/Downloads — dense `List`+`Item` rows edge-to-edge with `ProgressBar` (indeterminate variant), `EmptyState`; Bookmarks — `List`/tree + dialogs; Settings — `settings-sidebar` template (Selector, Switch, TextInput/Field, SegmentedControl, Collapsible groups); New-Tab — `Center` + search `InputGroup`, site grid via `ClickableCard` (no remote images; favicons via `favicon://`), configurable token backgrounds.
  - Status presentation: `StatusDot`/`Badge` (counts only) per AGENTS.md; **no Card-wrapped list items**.
- **i18n**: `useTranslator` (Astryx) with English catalog v1 + settings language key.
- **Layout reporting**: ResizeObserver on the chrome root → `chrome_layout_changed` (debounced); content-area sentinel never wraps webview content (webviews are native siblings).

---

## 20. Testing strategy

| Layer | Coverage |
|---|---|
| Rust unit | address (URL/search/normalize/HTTPS/invalid), nav policy (dangerous schemes), navlog (redirect dedupe), settings validation, permission precedence, tab state machine + lifecycle via `MockWebviewHandle`, session round-trip + corruption + version mismatch, DB migrations (in-memory), download name sanitization/duplicates, layout math (scale factors), **security: capability files grant nothing to `tab-*`; CallerGuard rejects non-chrome labels** |
| Rust integration | tab create/switch/close/destroy cycles on mock, resource cleanup (webview count returns to baseline), session save→restore through manager |
| E2E (`tauri-driver`, CI Linux) | launch, create tabs, address-bar navigation, remote-page IPC rejection probe, chrome accessibility spot-checks |
| Web perf | `web-perf` skill audit of chrome UI in Phase 5 (LCP/INP of tab switching, event storm debouncing) |
| Tooling gates | `rustfmt`, `cargo clippy --all-targets --all-features --locked -- -D warnings`, `cargo test`, `tsc --noEmit`, `vite build`, `cargo audit` + `npm audit` |

---

## 21. Risks & mitigations

1. **Linux Wayland child-webview bounds (tauri#15656, open)** — re-assert bounds on every activation + after scale changes; runtime detection logs capability state; **fallback mode** (settings `linux_compat_mode`) = single-live-webview (destroy/recreate on switch, state restored from metadata) if the bug manifests. Documented in matrix.
2. **`unstable` feature dependency** — all add_child/get_webview usage confined to `webview/`; migration note in docs; track stabilization in tauri 2.x minor releases.
3. **macOS gaps (permissions/context-menu/download-progress/load-failure)** — denied-by-default / engine-default / JS-interception / indeterminate-progress fallbacks, all documented, none faked.
4. **WebView2 sync deadlocks** — all commands async; webview calls never under lock; cookies read on tokio threads only.
5. **DB corruption** — WAL + migrations + aside-and-recreate recovery + `.bak` session; no data-loss-critical code panics (structured errors everywhere, `?` propagation; no `unwrap` outside tests).
6. **Event storms** (audio poll, progress, resize) — bounded polling intervals, debounced events, batched snapshots.

---

## 22. Build & release / CI / dependency policy

- **CI matrix** (`.github/workflows/ci.yml`): `windows-latest`, `macos-14`, `ubuntu-22.04` → fmt + clippy + tests + audit; `tauri build` producing NSIS/MSI · .app/.dmg · .deb/.rpm/AppImage; `tauri-driver` smoke on Linux; artifact upload. Reproducible via lockfiles; code-signing documented as org task (not configured).
- **Dependencies (all justified in `docs/DEPS.md`; official/MIT/Apache-2.0, actively maintained, cross-platform):** tauri 2.11 (`unstable`,`devtools`) · tauri-build · plugins {log, dialog, opener, notification, clipboard-manager, single-instance} · serde/serde_json · uuid · url · thiserror · rusqlite(bundled) · tokio · tracing + tracing-subscriber · platform: webview2-com/windows, objc2{,-foundation,-app-kit,-web-kit}, webkit2gtk/gtk. Frontend: react/react-dom, @tauri-apps/api, @astryxdesign/{core,theme-neutral}, vite/ts/plugin-react. **No shell plugin; no network in chrome.**

---

## 23. Phased build order (each phase runnable)

1. **Phase 1 — Foundation:** scaffold (vite/react/ts + Astryx setup + theme), capabilities, frameless window + custom titlebar, one child webview, address bar + back/forward/reload/stop, address.rs + nav policy + errors + logging + CI skeleton. *Single-tab browser.*
2. **Phase 2 — Tab system:** TabManager + mocks + tests, multi-webview, switch/close/reorder/duplicate/pin, title/url/loading events, focus/resize correctness, tab context menu, shortcut bridges, menu (macOS) + chrome menu.
3. **Phase 3 — Persistence:** db + migrations + repos, settings (+validation + page), history, bookmarks (folders/bar/import/export/dedup), session atomic save/restore + crash recovery + recently closed.
4. **Phase 4 — Browser features:** downloads (progress, tray, page, notifications, open/reveal), permissions broker + prompts + per-site UI, find, zoom, web context menus, mute/audio, tab sleep/discard, new-tab overlay (frequent/recent/closed/background), error pages (cert interstitial planned), bookmark bar, dnd polish.
5. **Phase 5 — Production:** security review + isolation tests, accessibility pass (labels/focus/reduced motion), web-perf audit, favicon cache, cleanup tasks, CI matrix, `tauri build` on Windows, docs, readiness checklist.

## 24. Deliverables (as `docs/` + code)

ARCHITECTURE.md · SECURITY.md · CAPABILITY_MATRIX.md · DATA_MODEL.md · TESTING.md · BUILD_RELEASE.md · SETUP.md (per-OS) · LIMITATIONS.md · READINESS.md · DEPS.md — plus the complete working application, CI config, e2e suite.

## 25. Conventions applied

AGENTS.md + Astryx workflow (build→template→component; tokens only; no `<div>` layout; StatusDot/Token over Badge; no Card-wrapped rows); `rust-best-practices` (thiserror hierarchy, `#[expect]` not `#[allow]`, clippy `-D warnings`, descriptive test names, no prod `unwrap`, `&str` params, type-state where cheap); `rust-async-patterns` (channels over shared state, JoinSet, CancellationToken, no lock-across-await, no blocking in async); `frontend-design` skill is referenced in `skills-lock.json` but missing on disk — Astryx conventions substitute. `web-perf` skill reserved for Phase 5.

---
