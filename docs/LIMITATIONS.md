# Rowster — Known Limitations

The following items document conscious architectural and platform constraints within Rowster.

---

## Engine-Level Constraints

1. **No Byte-Level Download Progress**: Tauri's core `DownloadEvent` exposes `Requested` and `Finished` events without byte increments. The Downloads page renders an indeterminate progress bar while downloads are active. Determinate progress rendering is reserved for future native platform hooks.
2. **Download Pause / Resume**: Underlying webview engines (WebView2, WKWebView, WebKitGTK) do not expose pause/resume hooks for active downloads; cancellation is supported.
3. **Hard Reload Behavior**: WebView2 lacks a distinct hard-reload hook; hard reload requests trigger a standard cache reload.
4. **Background Throttling**: Windows WebView2 does not automatically throttle hidden child webviews; memory is managed via Rowster's custom tab sleeping / memory discard implementation.
5. **Certificate Interstitials**: Certificate error handling relies on engine-native dialogs and trust stores. Rowster does not permit silent bypass of invalid certificates.

---

## Rowster Platform Behaviors

6. **Authentication & Biometrics**:
   - **Windows**: Full biometric sign-in (Windows Hello face/fingerprint/PIN) is supported via WinRT `UserConsentVerifier`.
   - **macOS / Linux**: Master password authentication (Argon2id) is fully supported; native Touch ID and PAM biometric integrations are planned for future releases.
7. **Keyboard Shortcuts in Focused Webviews**: Keyboard shortcuts are processed by the chrome window's keydown listener. When a child webview holds focus, native engine keys take precedence before bubbling to the window level.
8. **Linux Child Webview Positioning under Wayland**: Due to an upstream Wayland positioning constraint, Rowster re-asserts webview bounds upon tab activation and provides a `linux_compat_mode` setting. X11 sessions operate without constraint.
9. **macOS Notification Permissions**: In WKWebView, desktop notifications are denied by default due to engine limitations.
10. **Single Profile Scope**: Settings, database records, and authentication profiles are scoped to the local user's app-data directory. Multi-profile switching is out of scope for the current release.