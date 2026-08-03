use serde::{Deserialize, Serialize};

/// Label of the trusted chrome webview (the only webview with capabilities).
pub const MAIN_WEBVIEW_LABEL: &str = "main";

/// Prefix of every tab webview label, e.g. `tab-42`.
pub const TAB_WEBVIEW_PREFIX: &str = "tab-";

pub type TabId = u64;
pub type WindowId = u64;

/// The single browser window id. Multi-window support is planned; for now all
/// tabs live in window `1` (the `main` window).
pub const MAIN_WINDOW_ID: WindowId = 1;

/// Chrome-local pages rendered inside the chrome webview (never inside tab
/// webviews — those hold zero capabilities and cannot reach commands).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChromePage {
    Settings,
    History,
    Bookmarks,
    Downloads,
}

/// A tab that was closed, kept for "Reopen closed tab".
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClosedTab {
    pub url: String,
    pub title: String,
}

/// Serializable projection of a [`crate::tabs::Tab`], safe to send to the chrome.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabInfo {
    pub id: TabId,
    pub title: String,
    pub url: String,
    pub favicon_url: Option<String>,
    pub loading: bool,
    /// True while the tab still sits on the fresh `about:blank` page (no
    /// navigation yet). New tabs keep their webview hidden so the chrome
    /// new-tab page shows through.
    pub is_new: bool,
    /// Chrome-local page shown in place of the new-tab overlay (`None` when
    /// no chrome page is open on this tab).
    pub chrome_page: Option<ChromePage>,
    pub audio: bool,
    pub muted: bool,
    pub discarded: bool,
    /// Background tab hidden by the sleep sweeper (wakes on activation).
    pub sleeping: bool,
    pub pinned: bool,
    pub zoom: f64,
    pub can_go_back: bool,
    pub can_go_forward: bool,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserWindowInfo {
    pub id: WindowId,
    pub active_tab_id: Option<TabId>,
    pub tabs: Vec<TabInfo>,
}

/// Full state snapshot emitted on `tabs_snapshot` and returned by `startup_info`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BrowserSnapshot {
    pub windows: Vec<BrowserWindowInfo>,
}

#[derive(Debug, Clone, Serialize)]
pub struct IdPayload {
    pub id: TabId,
}

#[derive(Debug, Clone, Serialize)]
pub struct UrlChangedPayload {
    pub id: TabId,
    pub url: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TitleChangedPayload {
    pub id: TabId,
    pub title: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LoadingChangedPayload {
    pub id: TabId,
    pub loading: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct NavStateChangedPayload {
    pub id: TabId,
    pub can_go_back: bool,
    pub can_go_forward: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ZoomChangedPayload {
    pub id: TabId,
    pub zoom: f64,
}
