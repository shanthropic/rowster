//! Runtime e2e of the chrome/tab isolation guarantee (security plan §12.8).
//!
//! Uses Tauri's mock runtime to construct real `Webview` handles with the
//! labels the app assigns in production (`main` vs `tab-*`) and drives the
//! actual caller guard (`security::caller::assert_chrome`) that every IPC
//! command runs first.
//!
//! Together with the capability-scan and source-scan tests in
//! `security/mod.rs`, this pins the invariant: a tab webview can never
//! reach a command handler.
//!
//! Note: this test is gated off Windows. The mock-runtime test binary links
//! the full tao/wry windowing stack and its loader fails on Windows with
//! STATUS_ENTRYPOINT_NOT_FOUND (0xC0000139) at process start — a toolchain
//! quirk unrelated to the assertions. The static invariants are still fully
//! covered on Windows by the security/mod.rs scan tests; this file runs on
//! Linux and macOS CI.

#![cfg(not(target_os = "windows"))]

use tauri::test::{MockRuntime, mock_app};
use tauri::{Manager, WebviewWindowBuilder};

use rowster_lib::error::Error;
use rowster_lib::model::MAIN_WEBVIEW_LABEL;
use rowster_lib::security::caller::assert_chrome;

fn webview(app: &tauri::App<MockRuntime>, label: &str) -> tauri::Webview<MockRuntime> {
    WebviewWindowBuilder::new(app, label, Default::default())
        .build()
        .expect("mock webview must build");
    app.get_webview(label).expect("webview must be registered")
}

#[test]
fn tab_webview_is_rejected_by_the_caller_guard() {
    let app = mock_app();
    let tab = webview(&app, "tab-1");
    match assert_chrome(&tab) {
        Err(Error::UntrustedCaller(label)) => {
            assert_eq!(label, "tab-1");
        }
        other => panic!("expected UntrustedCaller, got {other:?}"),
    }
}

#[test]
fn chrome_webview_passes_the_caller_guard() {
    let app = mock_app();
    let main = webview(&app, MAIN_WEBVIEW_LABEL);
    assert!(assert_chrome(&main).is_ok());
}

#[test]
fn chrome_label_is_not_a_tab_label() {
    // The two invariants must be mutually exclusive: a webview is either
    // the chrome or a tab, never both.
    assert!(!MAIN_WEBVIEW_LABEL.starts_with("tab-"));
    assert!(
        assert_chrome(&webview(&mock_app(), "tab-anything")).is_err(),
        "any label starting with `tab-` must be rejected"
    );
}
