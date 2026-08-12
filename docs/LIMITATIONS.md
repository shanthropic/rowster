# Rowster — Known Limitations

Explicitly documented behavior — everything here is a **conscious decision**, not an oversight.

## Engine-level (all platforms)

1. **No download progress bytes.** Tauri 2.11 `DownloadEvent` exposes only `Requested` and `Finished`; there is no `Progress` variant. Native progress (WebView2 `BytesReceivedChanged`, WebKit `WebKitDownload::estimate-progress`) is **not wired in v1**. The Downloads page shows an *indeterminate* Astryx `ProgressBar` for `active`/`requested` rows, with determinate rendering reserved for when `total_bytes` is known (future native hooks).
2. **No pause/resume.** WebView2 and WKWebView cannot pause a download; only cancel. Rowster's cancel is synchronous on the main thread (path-based bookkeeping) so re-cancel is safe.
3. **Hard reload ≈ normal reload.** WebView2 gives no hard-reload; the menu item falls back to a normal reload. (WebKitGTK/WKWebView do support it.)
4. **Background throttling.** Windows WebView2 does not throttle hidden webviews; only the `sleep_inactive_tabs` (discard) path reclaims memory. macOS 14+ throttles by default; Linux WebKitGTK does not throttle.
5. **Cert interstitials** are engine-native pages. Rowster never bypasses, never auto-accepts. The Linux HTTP→HTTPS HSTS escape page also comes from the engine.
6. **No byte-level load progress** in the address bar — spinner is load-start/load-end only (same engine limitation as downloads).

## Rowster-level

7. **Chrome shortcuts while a tab webview has focus.** Tab keyboard shortcuts (Ctrl+W, Ctrl+Tab…) are handled by the chrome window's keydown listener; the webview grabs focus as soon as you click a page, so shortcuts keep working via the window-level handler — but native webview key handling (e.g. some engine shortcuts) wins first. Considered acceptable; per-engine shortcut interception is a follow-up.
8. **Wayland child-webview positioning** (Linux only): bounds mispositioning bug tauri#15656; committed fallback re-asserts bounds on tab activation and a `linux_compat_mode` setting exists. X11 (XWayland) is unaffected.
9. **macOS notifications unsupported** — the notification engine permission is denied by default (no prompt) because WebKitGTK/WKWebView do not expose it.
10. **Find in page** on Windows is `window.find`-based JS (find toolbar runs chrome-side), not the native UI; case/whole-word options live in the browser FindBar.
11. **Session granularity**: session save is debounced (~1s) and page history is capped per tab; a hard power cut loses at most the last second of tab set plus deep page history. The `.bak` file guarantees the previous session is recoverable.
12. **Single profile.** No multi-user profile switching; the settings table and session are global to the app-data dir.

## Scope notes

- v1 is Windows-first verified; macOS/Linux compile in CI but are runtime-verified by users. See [`CAPABILITY_MATRIX.md`](CAPABILITY_MATRIX.md).
- No extensions system, no built-in ad blocking, no sync/account — out of scope for 0.1.0 by design.
- `cargo audit` is manual, not yet a CI gate (see TESTING.md).
- No e2e (tauri-driver) suite yet; security-critical paths are pinned by unit + static-scan tests instead.