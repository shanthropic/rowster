# Rowster — Readiness Checklist (v0.1.0)

Status of the architectural plan's delivery phases, verified as of the last gate run.

## Phase status

| Phase | Scope | Status |
|---|---|---|
| A — Security & correctness audit | capability ACL fix, caller guards, navlog cursor, close-neighbor bug, session atomicity + validation, overlay visibility, duplicate/close-others/close-right, settings serialization, download prompt flow, favicon origin keys + no-redirect, canonical origins, permissions error propagation, db rename guard, CSP tightening, chrome rebuild on singleton store | ✅ Done + 3 commits (`eec794d`, `ae3388e`, `e2d6a7c`) |
| B — Download progress | indeterminate ProgressBar on Downloads page (UI-level; engine gives no bytes) | ✅ Done (UI-only, documented) |
| C — Tab reorder | Rust `reorder_to`/`reorder` + `tab_reorder` command (5 tests); TabStrip pointer-event drag-reorder wired through App/TitleBar with `tabReorder` IPC | ✅ Done |
| D — Documentation | `docs/` deliverables (this set) | ✅ Done |
| E — Release gates | `cargo audit`, Windows release bundle, final full gate run | ⏳ Pending |

## Verification snapshot (Phase A–C)

- Rust: 137 tests pass (`cargo test --all-features --locked`); clippy `-D warnings` clean; `cargo fmt --check` clean.
- Frontend: `tsc --noEmit` clean; `vite build` (production CSP) succeeds.
- Bundle: `tauri build --debug --no-bundle` succeeds.
- `npm audit`: 0 vulnerabilities.
- Security invariants pinned by tests: capability files never use `windows:` / grant tab webviews nothing; every command is caller-guarded.

## Remaining for v1 (Phase E)

1. Install `cargo-audit` (`cargo install cargo-audit`) and run `cargo audit` in `src-tauri/`; fix or document advisories.
2. Produce Windows release installer: `npx tauri build --release` (NSIS `.exe`).
3. Re-run the full gate sequence in [`BUILD_RELEASE.md`](BUILD_RELEASE.md#gate-sequence-must-all-pass-before-release).
4. Manual smoke test the release bundle (fresh profile: install, launch, create tabs, navigate, download, permission prompt, drag-reorder, restart → session restored).
5. Tag + CI publish if distributing.

## Post-v1 backlog (not blockers)

- Native download byte progress (WebView2/WebKit hooks) + determinate ProgressBar.
- e2e suite via `tauri-driver` on Windows layout path.
- `cargo audit` as a CI job.
- Web-perf audit of chrome UI (LCP/INP) via `web-perf` skill.
- Wayland native-path fix tracking upstream tauri#15656.