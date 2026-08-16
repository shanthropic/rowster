<p align="center">
  <img src="./app-icon.svg" alt="Rowster Logo" width="80" height="80" />
</p>

# Rowster

Rowster is a privacy-focused, native webview-based multi-tab desktop browser built with Rust, Tauri 2, and React + TypeScript + Astryx. It features a built-in authentication and access-control system supporting native passkeys and biometric verification.

Designed around the principle that remote web content must be treated as untrusted, Rowster sandboxes every tab inside isolated child webviews with zero native capabilities, enforces strict navigation and permission boundaries, and stores all user data locally.

---

## Core Pillars

- **Privacy-First Architecture**: Zero remote telemetry, zero analytics tracking, and zero cloud accounts. All browsing history, bookmarks, settings, and session states remain strictly local to your machine.
- **Built-in Authentication & Access Control**: Protect your browsing session with device-native biometric sign-in (Windows Hello), hardware passkeys, or an Argon2id-hashed master password. Unauthenticated sessions are locked and inaccessible.
- **True Native Isolation**: Tabs run in individual native child webviews (WebView2 on Windows, WebKitGTK on Linux, WKWebView on macOS). Remote pages have zero access to Tauri IPC commands, filesystem APIs, or chrome UI surfaces.
- **Local-First Data Storage**: Robust, high-performance SQLite storage in Write-Ahead Logging (WAL) mode, paired with atomic session state persistence and automated backup rotation.
- **Modern Astryx Chrome UI**: A clean, responsive desktop interface built on the Astryx design system with customizable Material You themes, full keyboard navigation, and fluent window management.

---

## Features

### Authentication and Device Security
- **Biometric Sign-In**: Native Windows Hello integration via WinRT `UserConsentVerifier` for instant face, fingerprint, or PIN unlock.
- **Native Passkeys**: Hardware-backed passkey authentication for secure browser session unlock.
- **Master Password Protection**: Password hashing using Argon2id with memory-hard parameters and automatic memory zeroization via `zeroize`.
- **Brute-Force Defense**: Exponential backoff rate limiting on repeated failed unlock attempts.
- **Fail-Closed Locking**: When locked, all browser commands, child webviews, and sensitive data queries are strictly blocked at the IPC layer.

### Tab Management & Navigation
- **Multi-Tab Browsing**: Tab strip with pointer drag-and-drop reordering, tab pinning, audio indicators, and per-tab mute toggling.
- **Tab Memory Optimization**: Automatic tab sleep and memory discard for inactive tabs with instant state restoration on activation.
- **Navigation Controls**: Back, forward, reload, and home navigation powered by a dedicated per-tab navigation log.
- **Smart Address Bar**: Instant distinction between web URLs and search queries, query parameter formatting, and active connection security badges.
- **Find in Page**: In-page search bar (Ctrl+F) with case-sensitivity options and match navigation.

### Data & Privacy Management
- **Granular Site Permissions**: Origin-based permission broker managing camera, microphone, geolocation, and notification access with allow-once and permanent policies.
- **Sanitized Downloads Pipeline**: Download validation enforcing strict path sanitization, directory confinement, duplicate resolution, and explicit execution guards.
- **Origin-Isolated Favicons**: Internal `favicon://` protocol with disk caching and redirect-blocking to prevent internal network scanning.
- **Bookmarks & History**: Dedicated management pages with search, hierarchical bookmark folders, retention policies, and 90-day frequency ranking.
- **Built-in Chrome Pages**: Internal pages for New Tab (featuring a live Material clock and quick links), History, Bookmarks, Downloads, Settings, and Authentication.

---

## Architecture & Security Model

```
+-------------------------------------------------------------------------+
|                  Trusted Chrome Webview ("main")                        |
|        React 19 + TypeScript + Astryx Design Tokens (Token-Only CSS)    |
|   TitleBar · TabStrip · AddressBar · Bookmarks · Internal Pages · Auth  |
+-------------------------------------------------------------------------+
       |                                                    ^
       | IPC Commands (Caller-Guarded)                      | State Events
       v                                                    |
+-------------------------------------------------------------------------+
|                         Rust Authoritative Core                         |
|   App State · Tabs Manager · Auth & Biometrics · SQLite (WAL) · Session |
|   Permissions Broker · Downloads Pipeline · Favicon Handler · NavPolicy |
+-------------------------------------------------------------------------+
       |
       | Native Webview Management (Bounds, Visibility, Focus, Navigation)
       v
+-------------------------------------------------------------------------+
|                Untrusted Child Webviews ("tab-1", "tab-2", ...)         |
|   Zero Tauri Capabilities · No IPC Access · Strict Scheme Sandboxing    |
|   WebView2 (Windows)  |  WebKitGTK (Linux)  |  WKWebView (macOS)       |
+-------------------------------------------------------------------------+
```

### Security Invariants

1. **Zero IPC Capabilities for Remote Content**: Only the `main` chrome webview is listed in Tauri capability ACLs (`capabilities/main.json`). Child tab webviews have no capability configurations and cannot call backend commands.
2. **Mandatory Caller Guarding**: Every IPC command handler asserts that `webview.label() == "main"` before execution (`security::caller::assert_chrome`), enforced by automated compile-time and static analysis tests.
3. **Strict Navigation Policy**: Child webviews reject privileged and dangerous URI schemes, including `file:`, `chrome:`, `tauri:`, `favicon:`, `data:`, and `javascript:`.
4. **Memory Security**: Authentication credentials and secret hashes in Rust memory are wrapped in `zeroize::Zeroizing` containers to prevent lingering secrets in deallocated heap memory.
5. **Atomic File Persistence**: Session profiles and authentication records (`auth.json`, `session.json`) utilize atomic temporary file creation, disk sync (`sync_all`), and atomic file replacement to prevent data corruption.

For comprehensive security details and vulnerability reporting guidelines, refer to [SECURITY.md](./SECURITY.md).

---

## Getting Started

### Prerequisites

- **Rust**: Version 1.85 or newer (2024 edition).
- **Node.js**: Version 20 or newer with `npm`.
- **Operating System Packages**:
  - **Windows**: Microsoft Edge WebView2 Runtime (pre-installed on Windows 10/11) and MSVC Build Tools.
  - **Linux (Debian/Ubuntu)**: `libwebkit2gtk-4.1-dev`, `build-essential`, `libssl-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`.
  - **macOS**: Xcode Command Line Tools.

Detailed setup instructions for all platforms are available in [docs/SETUP.md](./docs/SETUP.md).

### Installation and Local Development

1. Clone the repository:
   ```sh
   git clone https://github.com/shanthropic/rowster.git
   cd rowster
   ```

2. Install frontend dependencies:
   ```sh
   npm install
   ```

3. Launch Rowster in development mode:
   ```sh
   npm run tauri:dev
   ```

---

## Quality Gates and Verification

All changes must pass the complete quality gate sequence prior to merging or releasing:

```sh
# 1. Rust Quality Gates (from src-tauri/)
cargo fmt --check
cargo clippy --all-targets --all-features --locked -- -D warnings
cargo test --all-features --locked

# 2. Frontend Quality Gates (from root)
npm run theme:build
npm run typecheck
npm run build

# 3. Security and Dependency Audits
npm audit
```

For full testing protocols, see [docs/TESTING.md](./docs/TESTING.md).

---

## Project Structure

```
Rowster/
|-- src/                           # Trusted frontend chrome UI
|   |-- components/                # Title bar, tab strip, address bar, auth screens, sidebars
|   |-- pages/                     # New Tab, History, Bookmarks, Downloads, Settings
|   |-- theme/                     # Astryx theme tokens and CSS generation
|   |-- App.tsx                    # Main browser layout shell
|   |-- ipc.ts                     # Typed Tauri IPC wrappers and event bindings
|   `-- state.ts                   # External store synchronized with backend events
|-- src-tauri/                     # Authoritative Rust backend
|   |-- src/
|   |   |-- auth.rs                # Auth manager, Argon2id hashing, Windows Hello biometrics
|   |   |-- commands.rs            # IPC command dispatch with caller verification
|   |   |-- security/              # Navigation policy and caller guard verification
|   |   |-- tabs/                  # Child webview manager, lifecycle, and event dispatch
|   |   |-- db/                    # SQLite database migrations and connection pool
|   |   |-- repos/                 # History, bookmarks, downloads, and permission stores
|   |   |-- session.rs             # Atomic session state serialization and backup rotation
|   |   |-- downloads.rs           # Sanitized download pipeline
|   |   `-- permissions.rs         # Origin-based permission broker
|   |-- capabilities/              # Tauri capability definitions (scoped strictly to 'main')
|   `-- tests/                     # Integration and isolation invariant test suites
|-- docs/                          # In-depth architectural and technical documentation
|-- LICENSE                        # MIT License
|-- README.md                      # Project overview and quick start
|-- SECURITY.md                    # Security threat model and boundary invariants
`-- package.json                   # Frontend dependencies and build scripts
```

---

## Documentation Index

- [Architecture Guide](./docs/ARCHITECTURE.md): Deep dive into the process model, concurrency rules, and event pipeline.
- [Data Model & Storage](./docs/DATA_MODEL.md): Schemas for SQLite database, session files, and authentication profiles.
- [Capability Matrix](./docs/CAPABILITY_MATRIX.md): Platform feature support across Windows, macOS, and Linux.
- [Dependencies](./docs/DEPS.md): Pinned runtime and development dependencies.
- [Build & Release Guide](./docs/BUILD_RELEASE.md): Compilation, bundling, and distribution workflows.
- [Known Limitations](./docs/LIMITATIONS.md): Documented platform and engine behavioral boundaries.
- [Setup Guide](./docs/SETUP.md): Environment preparation and build prerequisites.
- [Testing Guide](./docs/TESTING.md): Unit, integration, and security scan testing suites.

---

## License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.
