# Rowster — Platform Capability Matrix

This matrix documents feature support across platforms. Rowster is developed and verified primarily on **Windows (WebView2)**; Linux (WebKitGTK) and macOS (WKWebView) targets compile in CI and maintain parity through cross-platform abstractions.

---

| Feature | Windows | macOS | Linux |
|---|---|---|---|
| Multi-tab child webviews | [Supported] | [Supported] | [Supported] (X11); [Partial] on Wayland (re-assert bounds on activation, `linux_compat_mode` setting available) |
| Built-in Auth & Biometrics (Windows Hello / Passkeys) | [Supported] (Native Windows Hello via WinRT `UserConsentVerifier` + Passkey support) | [Partial] (Argon2id master password unlock supported; biometric bridge reserved for post-v1) | [Partial] (Argon2id master password unlock supported; PAM/FIDO bridge reserved for post-v1) |
| Download decide / cancel / finished | [Supported] | [Supported] | [Supported] |
| Download progress | [Partial] (Indeterminate progress bar; byte hooks reserved for future platform integrations) | [Partial] (Indeterminate) | [Partial] (Indeterminate) |
| Download Pause / Resume | [Unsupported] (Not supported by underlying webview engines) | [Unsupported] | [Unsupported] |
| Find in page | [Supported] (JS `window.find` via `find.rs`) | [Supported] (Native engine) | [Supported] (Native engine) |
| Hard reload | [Partial] (Normal reload fallback on WebView2) | [Supported] | [Supported] |
| Load-failure reporting | [Supported] (Error banner and diagnostic logging) | [Supported] (Native engine page) | [Supported] (Native engine page) |
| Certificate interstitials | [Supported] (Native engine trust store; never silently bypassed) | [Supported] (Native engine) | [Supported] (Native engine) |
| Camera / Mic / Location / Notification permissions | [Supported] (Permission broker + custom chrome prompt) | [Partial] (Denied by default; notifications unsupported in WKWebView) | [Supported] (Permission broker + custom chrome prompt) |
| Global keyboard shortcuts | [Supported] (Window-level keydown handler) | [Supported] (Native menu accelerators) | [Supported] (GTK event handling) |
| Context menus | [Supported] (Engine native) | [Supported] (Engine native) | [Supported] (Engine native) |
| Audio playback indicators | [Supported] (Event-driven indicator) | [Supported] | [Supported] |
| Tab sleeping & memory discard | [Supported] (Custom discard and restore implementation) | [Supported] (Custom discard + system throttling) | [Supported] (Custom discard implementation) |
| Background webview throttling | [Unsupported] (Engine limitation; mitigated via tab sleeping) | [Supported] (macOS 14+) | [Unsupported] (Engine limitation; mitigated via tab sleeping) |
| External protocol handlers | [Supported] | [Supported] | [Supported] |
| Proxy configuration | [Supported] (Per-webview proxy settings) | [Partial] (macOS 14+) | [Supported] |
| Pointer drag-and-drop tab reordering | [Supported] (Chrome-managed pointer event reorder) | [Supported] | [Supported] |
| Feature detection at startup | [Supported] (`platform::capabilities()` logging and graceful degradation) | [Supported] | [Supported] |

---

### Legend

- `[Supported]`: Fully implemented, active in runtime, and covered by automated test suites.
- `[Partial]`: Feature functions with documented platform-specific constraints or engine fallbacks.
- `[Unsupported]`: Feature is constrained by the underlying engine architecture or intentionally out of scope.