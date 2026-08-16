# Rowster — Readiness Checklist

Status of architectural delivery phases and verification milestones.

---

## Phase Status

| Phase | Scope | Status |
|---|---|---|
| A — Security & Correctness Audit | Capability ACL restrictions, caller guards, navlog cursor management, close-neighbor logic, session atomicity and validation, overlay visibility, tab operations, settings serialization, download prompt flow, favicon origin keys with no-redirect guards, canonical origin parsing, permissions error propagation, DB rename protection, strict CSP, and chrome rebuild on singleton store | [Done] |
| B — Download Pipeline & UX | Indeterminate progress visualization on the Downloads page with sanitized destination paths and prompt confirmations | [Done] |
| C — Tab Reorder & Management | Backend `reorder_to` / `reorder` logic, `tab_reorder` IPC command, and pointer-event drag-and-drop tab strip integration | [Done] |
| D — Authentication & Biometrics | Master password protection with Argon2id hashing, `zeroize` memory safety, exponential backoff rate limiting, native Windows Hello biometric verification via WinRT `UserConsentVerifier`, passkey setup, atomic `auth.json` profile management, and fail-closed IPC gating | [Done] |
| E — Documentation & Licensing | Comprehensive project documentation across `docs/`, `README.md`, `SECURITY.md`, and official MIT `LICENSE` creation | [Done] |
| F — Release Verification | Full quality gate pass (`cargo fmt`, `cargo clippy`, `cargo test`, `npm run typecheck`, `npm run build`), dependency security audits, and bundle creation | [Done] |

---

## Verification Summary

- **Rust Test Suite**: Unit, state machine, and security invariant tests pass cleanly (`cargo test --all-features --locked`).
- **Rust Linters & Formatting**: `cargo clippy --all-targets --all-features --locked -- -D warnings` clean; `cargo fmt --check` clean.
- **Frontend Quality**: `tsc --noEmit` strict type check clean; `npm run build` succeeds under production CSP rules.
- **Dependency Audits**: `npm audit` reports 0 vulnerabilities.
- **Security Invariants**: Capability configuration scans confirm child webviews receive no capabilities; command source scan verifies 100% caller guarding.

---

## Release Checklist

1. Execute full quality gate sequence on both Windows and Linux CI runners.
2. Confirm zero vulnerabilities via dependency audit tooling.
3. Perform end-to-end smoke verification (fresh install, onboarding, password/biometric lock and unlock, navigation, downloads, tab reordering, restart session restore).
4. Tag release and trigger automated build pipelines.