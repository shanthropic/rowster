# Rowster Security

Rowster is a desktop browser. Its threat model treats **every remote site as
hostile**. This document records the security boundary, the invariants that
enforce it, and how each invariant is tested.

## Threat model

| Asset | Attacker | Goal |
|---|---|---|
| Local files, settings, history, downloads | A remote web page | Read/write files, steal browsing data, exfiltrate secrets |
| Chrome UI | A remote web page | Fake chrome surfaces, phishing, input capture |
| IPC surface | A remote web page | Invoke privileged commands (filesystem, settings, dialogs) |
| Native shell (window controls, plugins) | A remote web page | Drive the OS, open arbitrary apps, abuse notifications |

## Boundary

- **One process.** The chrome webview (`main`) runs the frontend; tab
  webviews (`tab-<id>`) run remote content. Rust is the single authority
  for all browser state.
- **Tab webviews are untrusted**: they hold zero capabilities, cannot
  receive chrome events, and every command entry point re-asserts the
  caller.
- **Chrome webview loads only local content** (frontend bundle). No remote
  origins; images come from `data:` or the internal `favicon://` protocol.

## Invariants

1. **No capability file matches `tab-*` labels.** Tab webviews can never
   invoke core or plugin commands through the ACL.
   - Tested: `security::tests::capabilities_never_cover_tab_webviews`
     (scans `capabilities/main.json`).
2. **Every IPC command rejects non-chrome callers.** Commands validate
   `webview.label() == "main"` before doing anything
   (`security::caller::assert_chrome`) — defense in depth in case the ACL
   is ever misconfigured.
   - Tested: `security::tests::every_command_is_caller_guarded` (source
     scan of `commands.rs`; a new command that skips the guard fails CI),
     and `tests/isolation.rs` (runtime guard checks on real mock-runtime
     `Webview` handles, Linux/macOS CI).
3. **Navigation policy blocks privileged/unsafe schemes.** Tab webviews
   reject `file:`, `chrome:`, `tauri:`, `favicon:`, `data:`, `javascript:`,
   unknown schemes, and any `about:` page other than `about:blank`
   (`security::nav_policy::validate`, enforced in both the address
   pipeline and `on_navigation`).
   - Tested: `security::nav_policy::tests`.
4. **Remote-domain IPC is disabled by Tauri defaults.** No
   `dangerousRemoteDomainIpcAccess`; custom commands additionally guard the
   caller (invariant 2).
5. **No secrets or privileged paths in frontend JS.** Data-directory paths
   never cross into tab webviews. Logs record origin and error kind, never
   credentials.
6. **Download paths are sanitized.** Filenames reject separators, `..`,
   absolute paths, and Windows-illegal characters; duplicates become
   `name (1).ext`; destinations always stay inside the configured download
   directory; open/reveal go through the opener plugin only.
7. **TLS is never bypassed silently.** Certificate errors surface an
   interstitial; proceeding is an explicit, per-origin decision recorded in
   logs (origin + error kind only).

## Reporting a vulnerability

Do not open a public issue. Contact the maintainers directly with a
reproducer; include the affected version and platform.
