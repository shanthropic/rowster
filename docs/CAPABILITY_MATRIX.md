# Rowster — Platform Capability Matrix

Status as of v0.1.0. Rowster is developed and verified primarily on **Windows (WebView2)**; Linux (WebKitGTK) and macOS (WKWebView) code paths compile via CI but are not runtime-verified.

| Feature | Windows | macOS | Linux |
|---|---|---|---|
| Multi-tab child webviews | ✅ | ✅ | ✅ (X11); ⚠️ Wayland bounds bug (tauri#15656) → committed fallback: re-assert bounds on activation, `linux_compat_mode` setting documented |
| Download decide / cancel / finished | ✅ | ✅ | ✅ |
| Download progress | ⚠️ indeterminate only — Tauri 2.11 `DownloadEvent` exposes `Requested`/`Finished`, not bytes; native hooks (WebView2 `BytesReceivedChanged`, WebKit `WebKitDownload`) are **not** wired in v1. UI shows an indeterminate bar | ⚠️ indeterminate | ⚠️ indeterminate |
| Pause/resume | ❌ (unsupported by engines) | ❌ | ❌ |
| Find in page | ✅ JS (`window.find` via `find.rs`) | engine-native | engine-native |
| Hard reload | ⚠️ = normal reload (engine) | ✅ | ✅ |
| Load-failure → UI | ✅ error banner/logging | engine page | engine page |
| Cert interstitial | engine default (no bypass; never silent) | engine default | engine default (+ http escape documented) |
| Camera/mic/location/notifications perms | ✅ broker + chrome prompt | ⚠️ denied by default; notifications unsupported | ✅ broker + chrome prompt |
| Shortcuts while page focused | chrome-level keydown (webview gets focus when active — documented limitation) | menu/JS | GTK event |
| Page context menus | engine-native | engine-native | engine-native |
| Audio indicator | ✅ event-driven | ✅ | ✅ |
| Tab sleeping (discard) | ✅ own implementation | ✅ own implementation (+throttle) | ✅ own implementation |
| Background throttling | ❌ engine | ✅ 14+ | ❌ engine |
| External-protocol links | ✅ | ✅ | ✅ |
| Proxy | ✅ via settings (per-webview URL) | ⚠️ macOS 14+ | ✅ |
| Tab drag-reorder | ✅ pointer-event reorder (chrome-owned, engine-independent) | ✅ | ✅ |
| Feature detection at startup | `platform::capabilities()` documented, logs + degrades | — | — |

Rows marked ✅ are implemented and exercised by the test suite; ⚠️ rows are engine-dependent behavior that Rowster documents rather than fakes.