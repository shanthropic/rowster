use tauri::Runtime;

use crate::error::{Error, Result};
use crate::model::MAIN_WEBVIEW_LABEL;

/// Caller guard: every IPC command must be invoked by the trusted chrome
/// webview. Tab webviews hold zero capabilities, but the guard is the second
/// layer in case the ACL is ever misconfigured or bypassed.
pub fn assert_chrome<R: Runtime>(webview: &tauri::Webview<R>) -> Result<()> {
    if webview.label() == MAIN_WEBVIEW_LABEL {
        Ok(())
    } else {
        Err(Error::UntrustedCaller(webview.label().to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chrome_label_constant_is_canonical() {
        // keep capability files and this constant in sync
        assert_eq!(MAIN_WEBVIEW_LABEL, "main");
    }
}
