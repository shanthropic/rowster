# Rowster — Testing

## Layers

| Layer | What it covers | Where |
|---|---|---|
| Rust unit | address resolution (URL/search/dangerous schemes), nav policy, navlog cursor/dedupe, settings validation, permission precedence + canonical origins, tab state machine on `MockWebviewHandle`, session round-trip/corruption/version/validation, DB migrations, download sanitization/dedupe/state machine, layout math, reorder semantics | `src-tauri/src/**` `#[cfg(test)]` modules |
| Rust security scans | capability files grant **nothing** to `tab-*` and never use `windows`; every registered command starts with the caller guard | `src-tauri/src/security/mod.rs` tests |
| Rust integration | caller guard against a real Tauri mock runtime (`main` passes, `tab-*` rejected) | `src-tauri/tests/isolation.rs` — **non-Windows only** (mock-runtime loader fails on Windows with STATUS_ENTRYNOT_FOUND; the static scans still pin the invariant on Windows CI) |
| Frontend | `tsc --noEmit` strict typecheck; production build (theme + Vite) | CI |
| Dependency audit | `npm audit` (0 vulnerabilities); `cargo-audit` — run manually, **not yet in CI** | CI/manual |

## Commands

```powershell
# Rust (from src-tauri/)
cargo fmt --check
cargo clippy --all-targets --all-features --locked -- -D warnings
cargo test --all-features --locked

# Frontend (from repo root)
npm run theme:build
npm run typecheck
npm run build        # tsc --noEmit && vite build

# Whole app (compile, no installer)
npx tauri build --debug --no-bundle

# Release installer
npx tauri build --release

# Dependency audits
npm audit
cargo install cargo-audit; cargo audit   # run from src-tauri/
```

## Gates (CI)

`.github/workflows/ci.yml` runs on `windows-latest` and `ubuntu-latest` on push/PR:

rustfmt → clippy(`-D warnings`) → `cargo test` → theme build → typecheck → vite build.

`tests/isolation.rs` executes on the Ubuntu job (non-Windows `cfg`).

## Coverage notes

- Manager logic that needs an `AppHandle` (snapshot emits) is split into testable inner helpers (`remove_from_order`, `reorder_to`) so ordering semantics are unit-tested without a runtime.
- No e2e suite (`tauri-driver`) is wired yet; the runtime gap is largest on the Windows child-webview layout path, so manual smoke-test those flows.
- Web-performance audit of chrome UI (LCP/INP, event-storm debouncing) is a Phase-5 follow-up using the `web-perf` skill.