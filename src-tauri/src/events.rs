use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};

use crate::error::Result;
use crate::model::MAIN_WEBVIEW_LABEL;

pub const EV_TABS_SNAPSHOT: &str = "tabs_snapshot";
pub const EV_TAB_CREATED: &str = "tab_created";
pub const EV_TAB_CLOSED: &str = "tab_closed";
pub const EV_TAB_ACTIVATED: &str = "tab_activated";
pub const EV_URL_CHANGED: &str = "url_changed";
pub const EV_TITLE_CHANGED: &str = "title_changed";
pub const EV_LOADING_CHANGED: &str = "loading_changed";
pub const EV_NAV_STATE_CHANGED: &str = "nav_state_changed";
pub const EV_ZOOM_CHANGED: &str = "zoom_changed";
pub const EV_SETTINGS_CHANGED: &str = "settings_changed";
pub const EV_BOOKMARKS_CHANGED: &str = "bookmarks_changed";
pub const EV_DOWNLOAD_REQUESTED: &str = "download_requested";
pub const EV_DOWNLOAD_STARTED: &str = "download_started";
pub const EV_DOWNLOAD_COMPLETED: &str = "download_completed";
pub const EV_DOWNLOAD_FAILED: &str = "download_failed";
pub const EV_DOWNLOAD_CANCELLED: &str = "download_cancelled";
pub const EV_DOWNLOAD_OPEN_CONFIRM: &str = "download_open_confirm";
pub const EV_PERMISSION_REQUESTED: &str = "permission_requested";
pub const EV_FIND_STATUS: &str = "find_status";
pub const EV_FAVICON_CHANGED: &str = "favicon_changed";

/// Emits an event to the trusted chrome webview only.
///
/// Tab webviews never receive chrome events; they have no capabilities and
/// are treated as untrusted content.
pub fn emit_to_chrome<R: Runtime, S: Serialize + Clone>(
    app: &AppHandle<R>,
    event: &str,
    payload: S,
) -> Result<()> {
    app.emit_to(MAIN_WEBVIEW_LABEL, event, payload)?;
    Ok(())
}
