use std::sync::Arc;

#[cfg(test)]
use url::Url;

use crate::error::Result;
use crate::model::{ChromePage, TabId, TabInfo};
use crate::navlog::NavigationLog;
use crate::webview::handle::WebviewHandle;

/// Internal representation of an open tab.
#[derive(Clone)]
pub struct Tab {
    pub id: TabId,
    pub title: String,
    pub url: Option<String>,
    pub favicon_url: Option<String>,
    pub loading: bool,
    pub audio: bool,
    pub muted: bool,
    pub discarded: bool,
    /// Hidden by the sleep sweeper; the page keeps running, only the
    /// webview visibility is toggled (no state loss).
    pub sleeping: bool,
    pub pinned: bool,
    pub zoom: f64,
    pub chrome_page: Option<ChromePage>,
    pub navlog: NavigationLog,
    pub handle: Arc<dyn WebviewHandle>,
    /// Epoch seconds of the last interaction (used by the sleep sweeper).
    pub last_used_at: i64,
    /// One-shot download prompt bypass: the next `on_download` request for
    /// this exact URL is accepted without the ask-before-download dialog
    /// (set when the user allowed a download prompt, then re-navigation
    /// re-triggers the engine request).
    pub pending_download: Option<(i64, String)>,
}

impl Tab {
    pub fn new(id: TabId, handle: Arc<dyn WebviewHandle>) -> Self {
        Self {
            id,
            handle,
            title: "New Tab".to_string(),
            url: Some("about:blank".to_string()),
            favicon_url: None,
            loading: false,
            audio: false,
            muted: false,
            discarded: false,
            sleeping: false,
            pinned: false,
            zoom: 1.0,
            chrome_page: None,
            navlog: NavigationLog::new(),
            last_used_at: crate::repos::bookmarks::now_epoch(),
            pending_download: None,
        }
    }

    pub fn to_info(&self, is_active: bool) -> TabInfo {
        TabInfo {
            id: self.id,
            title: self.title.clone(),
            url: self.url.clone().unwrap_or_default(),
            favicon_url: self.favicon_url.clone(),
            loading: self.loading,
            is_new: self.is_new_tab(),
            chrome_page: self.chrome_page,
            audio: self.audio && !self.muted,
            muted: self.muted,
            discarded: self.discarded,
            sleeping: self.sleeping,
            pinned: self.pinned,
            zoom: self.zoom,
            can_go_back: self.navlog.can_go_back(),
            can_go_forward: self.navlog.can_go_forward(),
            is_active,
        }
    }

    /// A fresh tab that has never navigated still shows `about:blank` and
    /// keeps its webview hidden, letting the chrome new-tab page show through.
    pub fn is_new_tab(&self) -> bool {
        self.navlog.is_empty()
    }

    #[cfg(test)]
    pub fn navigate(&mut self, url: Url) -> Result<()> {
        let url_str = url.to_string();
        self.handle.navigate(&url_str)?;
        self.navlog.push(url_str, None);
        Ok(())
    }

    pub fn go_back(&self) -> Result<()> {
        self.handle.go_back()
    }

    pub fn go_forward(&self) -> Result<()> {
        self.handle.go_forward()
    }

    pub fn reload(&self) -> Result<()> {
        self.handle.reload()
    }

    pub fn hard_reload(&self) -> Result<()> {
        self.handle.hard_reload()
    }

    pub fn stop(&self) -> Result<()> {
        self.handle.stop()
    }

    /// Reconciles the navigation log after a finished page load.
    pub fn on_loaded(&mut self, url: &str) {
        // A discarded tab sits on about:blank; keep the remembered URL and
        // navigation log so activation can restore the page.
        if self.discarded && url == "about:blank" {
            self.loading = false;
            return;
        }
        self.url = Some(url.to_string());
        self.loading = false;
        // The engine fires a load-finished for the initial about:blank page
        // of a fresh tab. That is not a navigation: the log must stay empty
        // so the tab remains "new" (hidden webview, chrome new-tab page).
        if !(url == "about:blank" && self.navlog.is_empty()) {
            self.navlog.sync_to(url);
        }
    }

    pub fn on_load_started(&mut self) {
        self.loading = true;
    }

    /// Sets loading to `false` after a user-initiated stop.
    pub fn on_stopped(&mut self) {
        self.loading = false;
    }

    pub fn set_title(&mut self, title: &str) {
        self.title = title.to_string();
        if let Some(url) = self.url.clone() {
            self.navlog.set_title(&url, title);
        }
    }

    /// Marks the tab as recently used (sweep clock).
    pub fn touch(&mut self) {
        self.last_used_at = crate::repos::bookmarks::now_epoch();
    }

    /// Applies engine-level muting and records the state. On WebView2 the
    /// mute is a page-JS fallback; on WebKit it is engine-level.
    #[cfg(test)]
    pub fn set_muted(&mut self, muted: bool) -> Result<()> {
        self.handle.set_muted(muted)?;
        self.muted = muted;
        Ok(())
    }

    /// Restores a muted tab after a page load (JS fallbacks reset on
    /// navigation; engine-level mutes are idempotent).
    pub fn reapply_mute(&self) -> Result<()> {
        if self.muted {
            self.handle.set_muted(true)?;
        }
        Ok(())
    }

    /// Marks the tab as sleeping: the webview is hidden but the page keeps
    /// running, so no reload is needed on wake.
    pub fn sleep(&mut self) -> Result<()> {
        self.handle.set_visible(false)?;
        self.sleeping = true;
        Ok(())
    }

    /// Wakes a sleeping tab (visibility only).
    #[cfg(test)]
    pub fn wake(&mut self) -> Result<()> {
        self.handle.set_visible(true)?;
        self.sleeping = false;
        Ok(())
    }

    /// Unloads the page into `about:blank`, remembering the URL so the tab
    /// can be restored on activation.
    #[cfg(test)]
    pub fn discard(&mut self) -> Result<()> {
        self.handle.navigate("about:blank")?;
        self.discarded = true;
        Ok(())
    }

    /// Arms the one-shot download bypass for `url`.
    pub fn allow_next_download(&mut self, id: i64, url: &str) {
        self.pending_download = Some((id, url.to_string()));
    }

    /// Consumes the bypass when it matches `url`; used by the download hook.
    pub fn take_pending_download(&mut self, url: &str) -> Option<i64> {
        let matches = self
            .pending_download
            .as_ref()
            .is_some_and(|(_, pending_url)| pending_url == url);
        matches
            .then(|| self.pending_download.take().map(|(id, _)| id))
            .flatten()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::webview::mock::MockWebviewHandle;

    #[test]
    fn fresh_tab_is_new() {
        let tab = Tab::new(1, MockWebviewHandle::bind());
        assert!(tab.is_new_tab());
        assert!(tab.to_info(false).is_new);
    }

    #[test]
    fn initial_blank_load_keeps_tab_new() {
        let mut tab = Tab::new(1, MockWebviewHandle::bind());
        tab.on_loaded("about:blank");
        assert!(tab.is_new_tab());
    }

    #[test]
    fn navigation_marks_tab_used() {
        let mut tab = Tab::new(1, MockWebviewHandle::bind());
        let url = Url::parse("https://example.com/").unwrap();
        tab.navigate(url).unwrap();
        assert!(!tab.is_new_tab());
        assert!(!tab.to_info(false).is_new);
    }

    #[test]
    fn blank_load_after_real_navigation_is_not_new() {
        let mut tab = Tab::new(1, MockWebviewHandle::bind());
        let url = Url::parse("https://example.com/").unwrap();
        tab.navigate(url).unwrap();
        tab.on_loaded("about:blank");
        assert!(!tab.is_new_tab());
    }
}
