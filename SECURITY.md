# Rowster Security

Rowster is a desktop browser. Its security model treats **every remote site as hostile**. This document records the threat model, the security boundaries, the authentication security architecture, the invariants that enforce system integrity, and how each invariant is verified.

---

## Threat Model

| Asset | Attacker | Goal | Mitigation |
|---|---|---|---|
| Local files, history, bookmarks, downloads | A remote web page | Read/write files, steal browsing data, exfiltrate secrets | Child webviews run with zero capabilities; data access is gated by the authoritative Rust core |
| Authentication profile, master password, device sign-in | Malicious actor / unauthorized local user | Access saved browser state, unlock browser without credentials | Argon2id hashing, secure memory zeroization, exponential rate limiting, Windows Hello biometric verification, fail-closed IPC gating |
| Chrome UI | A remote web page | Fake chrome surfaces, phishing, input capture | Chrome runs in an isolated `main` webview; child webviews are strictly bounded and positioned below chrome controls |
| IPC surface | A remote web page | Invoke privileged commands (filesystem, settings, dialogs) | Tauri capability ACL restricted exclusively to `main`; command handlers enforce caller label checks |
| Native shell (window controls, plugins) | A remote web page | Drive the OS, execute arbitrary binaries, abuse notifications | System interactions mediated solely via verified Rust plugins with strict path and parameter sanitization |

---

## Security Boundary

- **Single Process Model**: The trusted chrome webview (`main`) renders the browser interface; untrusted tab webviews (`tab-<id>`) render remote content. The Rust core is the single source of truth for all browser state and operations.
- **Untrusted Child Webviews**: Tab webviews are created with zero Tauri capabilities. They cannot receive chrome-scoped events and cannot invoke any backend commands.
- **Local Chrome Content**: The chrome webview loads strictly local frontend assets bundled with the binary. No remote origins are ever loaded into the chrome context; images originate from local assets or the isolated `favicon://` internal protocol.
- **Fail-Closed Authentication Barrier**: When the browser is in the `locked` or `onboarding` phase, all state-mutating and data-reading commands reject execution via `auth.require_unlocked()`. Only explicit authentication endpoints (`auth_status`, `auth_complete_onboarding`, `auth_unlock_password`, `auth_unlock_passkey`) are permitted.

---

## Security Invariants

### 1. Capability Scoping
No capability file in `src-tauri/capabilities/` matches `tab-*` webview labels. Tab webviews can never invoke core framework or plugin commands through the Tauri ACL.
- **Verification**: `security::tests::capabilities_never_cover_tab_webviews` statically parses and verifies `capabilities/main.json`.

### 2. Mandatory Caller Guarding
Every IPC command handler explicitly verifies that `webview.label() == "main"` before processing arguments or mutating state (`security::caller::assert_chrome`). This provides defense-in-depth against ACL misconfiguration.
- **Verification**: `security::tests::every_command_is_caller_guarded` performs a source code scan of `commands.rs` during CI, and `tests/isolation.rs` executes runtime guard checks against mock webview handles.

### 3. Scheme Sandboxing and Navigation Policy
Child webviews reject privileged, internal, and unsafe URI schemes, including `file:`, `chrome:`, `tauri:`, `favicon:`, `data:`, `javascript:`, and unknown schemes. Only standard web schemes (`http:`, `https:`) and `about:blank` are permitted.
- **Verification**: `security::nav_policy::tests` runs comprehensive URI rejection test cases.

### 4. Robust Password Hashing and Zeroization
When master password protection is enabled, passwords are processed through the Argon2id key derivation function configured with memory-hard parameters (19,456 KiB memory cost, 2 iterations, 1 lane, and cryptographic salt from `OsRng`). Passwords in memory are wrapped in `zeroize::Zeroizing` wrappers to guarantee prompt zeroization upon drop.
- **Verification**: `auth::tests::password_roundtrip_unlocks` and strict typing with the `zeroize` crate.

### 5. Biometric and Passkey Verification
Native device authentication uses the platform security provider (Windows Hello via WinRT `UserConsentVerifier`). Requests execute within isolated thread apartments and require explicit user verification. If biometric hardware or user verification is unavailable, authentication fails closed and falls back to password entry.
- **Verification**: `auth::tests::passkey_requires_password` and fail-closed availability checks.

### 6. Brute-Force Rate Limiting
Repeated failed authentication attempts trigger exponential backoff rate limiting. Failed attempt counters delay successive unlock requests, mitigating offline and automated brute-force attacks.
- **Verification**: `auth::tests::wrong_password_is_rejected_and_rate_limited`.

### 7. Atomic Profile and Session Persistence
All sensitive state files (`auth.json`, `session.json`) are written using an atomic write protocol: write to a temporary file (`.tmp`), flush to disk with `sync_all()`, apply strict private filesystem permissions (0600 on POSIX), rotate existing files to backup (`.bak`), and atomically replace the destination file.
- **Verification**: `auth::tests::profile_updates_replace_existing_file` and `session::tests::atomic_roundtrip`.

### 8. Download Path Sanitization
Download filenames are sanitized to strip path separators, directory traversal sequences (`..`), leading/trailing periods, and platform-reserved characters. Download destinations are strictly confined to the user-designated directory, and executable file launches require explicit, non-default user consent.
- **Verification**: `downloads::tests::sanitizes_unsafe_names`.

### 9. Secure Favicon Pipeline
The custom `favicon://` internal protocol fetches and caches origin icons locally. The fetcher enforces a strict no-redirect policy to prevent server-side request forgery (SSRF) and intranet scanning attacks. Cache keys are sanitized and mapped to canonical origin strings.
- **Verification**: `favicons::tests::sanitizes_cache_keys`.

### 10. Strict Transport Security (TLS)
Rowster never auto-bypasses or silently ignores TLS certificate errors. Certificate validations adhere strictly to platform engine trust stores.

---

## Reporting a Vulnerability

If you discover a potential security vulnerability within Rowster, please do not open a public issue. Contact the maintainers directly with details of the vulnerability, a proof of concept or reproduction steps, and the affected version/platform.
