# Rowster — Testing

---

## Test Layers

| Layer | What It Covers | Location |
|---|---|---|
| Rust Unit Tests | Address resolution, navigation policy, navlog cursors, settings validation, permission broker rules, tab state machine on `MockWebviewHandle`, session serialization and backup rotation, SQLite migrations, download sanitization, layout math, tab reorder semantics, and **Authentication** (Argon2id hashing, rate limiting, profile corruption handling, passkey requirements) | `src-tauri/src/**` `#[cfg(test)]` modules |
| Rust Security Scans | Capability configuration assertions (validates that `tab-*` holds zero capabilities and never matches `windows:`); command caller guard verification (asserts that every command starts with `caller::assert_chrome`) | `src-tauri/src/security/mod.rs` |
| Rust Integration Tests | Runtime caller guard rejection against mock webview handles | `src-tauri/tests/isolation.rs` (non-Windows CI) |
| Frontend Typecheck & Build | Strict TypeScript validation (`tsc --noEmit`) and Vite production bundle generation under production CSP | Repo root |
| Dependency Audits | Automated `npm audit` vulnerability checks | CI pipeline |

---

## Execution Commands

```powershell
# 1. Rust backend tests and linters (from src-tauri/)
cargo fmt --check
cargo clippy --all-targets --all-features --locked -- -D warnings
cargo test --all-features --locked

# 2. Frontend validation (from repo root)
npm run theme:build
npm run typecheck
npm run build

# 3. Whole application builds
npx tauri build --debug --no-bundle
npx tauri build --release

# 4. Dependency security audit
npm audit
```

---

## Continuous Integration Quality Gates

CI workflows execute on both `windows-latest` and `ubuntu-latest` on every push and pull request:

```
rustfmt -> clippy (-D warnings) -> cargo test -> theme build -> tsc typecheck -> vite build -> npm audit
```