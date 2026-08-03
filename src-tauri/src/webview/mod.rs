//! Webview abstraction layer.
//!
//! `WebviewHandle` decouples the tab manager from the concrete Tauri
//! `Webview` type so the manager can be unit-tested against a mock. The live
//! implementation requires the tauri `unstable` cargo feature (child
//! webviews via `Window::add_child`).

pub mod handle;

#[cfg(test)]
pub mod mock;
