# Rowster — Architecture

Rowster is a privacy-focused, multi-tab desktop browser built with Rust and Tauri 2. This document serves as the technical reference for the browser implementation. Design rationale and milestone specifications are documented in [`rowster_complete_architectural_plan.md`](../rowster_complete_architectural_plan.md).

---

## Process Model

Rowster operates as a single OS process with strict separation between trusted interface controls and untrusted web content:

- **Chrome Webview** (label `main`): The trusted user interface environment rendering the title bar, tab strip, address bar, bookmarks bar, status bar, and internal chrome pages (History, Bookmarks, Downloads, Settings, and Auth screens). This is the only webview configured with Tauri IPC capabilities in `src-tauri/capabilities/main.json`.
- **Tab Webviews** (labels `tab-1`, `tab-2`, ...): Real native child webviews instantiated via `WebviewBuilder` (using Tauri's `unstable` multi-webview feature). Tab webviews hold zero capabilities, cannot call IPC commands, cannot receive chrome events, and are isolated behind navigation and security policies.
- **Rust Core**: Authoritative manager of all application state, tab lifecycles, database persistence, session records, security boundaries, and authentication profiles.

---

## Backend Modules (`src-tauri/src`)

| Module | Responsibility |
|---|---|
| `app.rs` | Application setup, builder configuration, internal `favicon://` protocol, session restoration, and startup sequence |
| `auth.rs` | Authentication manager: Argon2id password hashing, zeroization, exponential rate limiting, Windows Hello WinRT biometric integration, and profile persistence |
| `commands.rs` | IPC command dispatcher; enforces caller checks (`caller::assert_chrome`) and authentication lock-state gating (`auth.require_unlocked`) |
| `address.rs` | Address bar input parsing, search query transformation, and URL normalization (`Address::resolve`) |
| `security/` | Security caller guards (`caller.rs`), scheme-filtering navigation policy (`nav_policy.rs`), and capability configuration unit tests |
| `tabs/manager.rs` | Tab lifecycle management: creation, activation, closure, reordering, duplication, engine event hooks (navigation, page load, downloads, permissions) |
| `tabs/tab.rs` | Per-tab state machine (active, discarded/sleeping, muted, navigation log) |
| `webview/handle.rs` | `WebviewHandle` abstraction allowing tab management logic to be unit tested against mock runtimes |
| `session.rs` | Atomic session persistence (`session.json` + `session.json.bak` rotation) and snapshot validation |
| `downloads.rs` | Download pipeline: path sanitization, ask-before-download prompt flow, progress tracking, status transitions, and executable launch confirmation |
| `permissions.rs` | `PermissionBroker` resolving permission queries against canonical origins and stored policies |
| `favicons.rs` | Origin-keyed favicon caching and serving via `favicon://localhost/<key>.ico` with strict SSRF / no-redirect guards |
| `find.rs` | In-page text search orchestration via `window.find` |
| `layout.rs` | Chrome geometry metrics to child webview bounds calculation |
| `db/` + `repos/` | SQLite database connection management (WAL mode, versioned migrations) and repositories for history, bookmarks, downloads, and site permissions |
| `settings.rs` | Validated browser settings schema and serialized write management |
| `events.rs` | Strongly-typed event name constants dispatched exclusively to the `main` chrome webview |
| `error.rs` | Structured `thiserror` error hierarchy and safe mutex acquisition helpers |
| `model.rs` | Serde data models: `TabInfo`, `BrowserWindowInfo`, `BrowserSnapshot`, `MAIN_WEBVIEW_LABEL`, `TAB_WEBVIEW_PREFIX` |
| `navlog.rs` | Per-tab navigation history and back/forward stack derivation |
| `state.rs` | `AppState` container holding shared managers, database connection, authentication state, and async channels |

---

## Authentication & Access Control Lifecycle

1. **Startup Check**: On application launch, `AuthManager::load` inspects `auth.json` in the app-data directory.
   - If no profile exists, the phase is `Onboarding`.
   - If a profile with a password or passkey exists, the phase is `Locked`.
   - If a profile without a password exists, the phase is `Unlocked`.
2. **Locked Phase Isolation**: While in `Onboarding` or `Locked` state:
   - All standard browser IPC commands reject execution immediately with `Error::AuthenticationRequired` or `Error::OnboardingRequired`.
   - Child tab webviews are hidden and prevented from rendering content or receiving focus.
   - Only authentication endpoints (`auth_status`, `auth_complete_onboarding`, `auth_unlock_password`, `auth_unlock_passkey`) are processed.
3. **Unlocking**:
   - **Password**: Evaluated against stored Argon2id hashes with exponential backoff on failure.
   - **Biometrics / Windows Hello**: Evaluated via WinRT `UserConsentVerifier` within an apartment runtime.
4. **Browser Initialization**: Once unlocked, `ensure_browser_started` triggers SQLite initialization, session restore, and child webview display.

---

## Concurrency and State Rules

- **Asynchronous Execution**: All IPC commands are `async`. Expensive operations (DB queries, password hashing, file I/O) run on `spawn_blocking`.
- **Lock Discipline**: Mutex locks are held only for memory state mutations and are never held across `.await` points or native webview calls.
- **Webview Invocation Safety**: Native webview handles are cloned and locks released before executing native engine calls.
- **Serialized Settings & Profile Writes**: Settings and auth profile changes are serialized via dedicated async mutexes and fsynced to disk prior to command completion.
- **Event-Driven UI**: Rust pushes state changes to the frontend using scoped events (`tabs_snapshot`, `tab_created`, `url_changed`). The frontend stores no authoritative browser state.

---

## Frontend Architecture (`src/`)

- **State Management** (`state.ts`): Singleton store implemented via `useSyncExternalStore`. Populated on initialization via `startup_info` and synchronized live through Tauri events.
- **Layout Shell** (`App.tsx`): Top-level container managing the TitleBar (tabs & window controls), NavigationBar (history controls, address bar, menu), BookmarkBar, Content viewport, Auth screens, and status overlays.
- **Design Tokens**: Astryx design system integration with custom token-driven styling (`styles/chrome.css`). No utility CSS compilers or hardcoded pixel values are used.
