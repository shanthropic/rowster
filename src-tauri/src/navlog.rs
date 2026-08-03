use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NavEntry {
    pub url: String,
    pub title: Option<String>,
}

/// Per-tab navigation history.
///
/// Tauri's `Webview` does not expose back/forward state, so Rowster keeps its
/// own log of visited URLs and drives the engine with `history.go(±n)`.
/// The log is reconciled with the engine on every finished page load
/// ([`NavigationLog::sync_to`]).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct NavigationLog {
    entries: Vec<NavEntry>,
    /// Index of the current entry. `usize::MAX` marks an empty log.
    index: usize,
}

impl NavigationLog {
    pub fn new() -> Self {
        Self {
            entries: Vec::new(),
            index: usize::MAX,
        }
    }

    pub fn current(&self) -> Option<&NavEntry> {
        self.entries.get(self.index)
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn can_go_back(&self) -> bool {
        self.index > 0 && self.index < self.entries.len()
    }

    pub fn can_go_forward(&self) -> bool {
        self.index.saturating_add(1) < self.entries.len()
    }

    /// Records a new navigation, discarding any forward entries.
    /// Duplicate consecutive URLs are collapsed in place.
    pub fn push(&mut self, url: String, title: Option<String>) {
        if let Some(cur) = self.current()
            && cur.url == url
        {
            if title.is_some()
                && let Some(cur) = self.entries.get_mut(self.index)
            {
                cur.title = title;
            }
            return;
        }
        self.entries.truncate(self.index.saturating_add(1));
        self.entries.push(NavEntry { url, title });
        self.index = self.entries.len() - 1;
    }

    /// Reconciles the log with the engine's current URL after a page load.
    ///
    /// - same as current → no-op
    /// - found elsewhere in the log → move the cursor there (back/forward)
    /// - unknown → record a new entry (fresh navigation)
    ///
    /// Returns `true` if the cursor moved.
    pub fn sync_to(&mut self, url: &str) -> bool {
        if self.current().is_some_and(|e| e.url == url) {
            return false;
        }
        if let Some(pos) = self.entries.iter().position(|e| e.url == url) {
            self.index = pos;
            return true;
        }
        self.push(url.to_string(), None);
        true
    }

    /// Updates the title of the entry matching `url` (used by document-title
    /// change events, which can fire before the load finishes).
    pub fn set_title(&mut self, url: &str, title: &str) {
        if let Some(cur) = self.entries.get_mut(self.index)
            && cur.url == url
        {
            cur.title = Some(title.to_string());
            return;
        }
        if let Some(entry) = self.entries.iter_mut().find(|e| e.url == url) {
            entry.title = Some(title.to_string());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn log_with(urls: &[&str]) -> NavigationLog {
        let mut log = NavigationLog::new();
        for u in urls {
            log.push(u.to_string(), None);
        }
        log
    }

    #[test]
    fn empty_log_has_no_navigation() {
        let log = NavigationLog::new();
        assert!(log.is_empty());
        assert!(!log.can_go_back());
        assert!(!log.can_go_forward());
        assert_eq!(log.current(), None);
    }

    #[test]
    fn push_records_and_collapses_duplicates() {
        let mut log = NavigationLog::new();
        log.push("a".into(), None);
        log.push("a".into(), None);
        assert_eq!(log.current().unwrap().url, "a");
        log.push("b".into(), None);
        assert_eq!(log.current().unwrap().url, "b");
    }

    #[test]
    fn push_from_back_truncates_forward() {
        let mut log = log_with(&["a", "b", "c"]);
        assert!(log.sync_to("b"));
        log.push("d".into(), None);
        assert_eq!(log.current().unwrap().url, "d");
        assert!(!log.can_go_forward());
        assert!(log.can_go_back());
    }

    #[test]
    fn sync_to_matches_existing_entries() {
        let mut log = log_with(&["a", "b", "c"]);
        assert_eq!(log.current().unwrap().url, "c");
        assert!(log.sync_to("a"));
        assert_eq!(log.current().unwrap().url, "a");
        assert!(!log.sync_to("a")); // already there
    }

    #[test]
    fn sync_to_records_unknown_urls() {
        let mut log = log_with(&["a", "b"]);
        assert_eq!(log.current().unwrap().url, "b");
        assert!(log.sync_to("https://example.com/x"));
        assert_eq!(log.current().unwrap().url, "https://example.com/x");
        assert!(log.can_go_back());
        assert!(!log.can_go_forward());
    }

    #[test]
    fn set_title_updates_current_entry() {
        let mut log = log_with(&["a", "b"]);
        log.set_title("b", "Bee");
        assert_eq!(log.current().unwrap().title.as_deref(), Some("Bee"));
    }

    #[test]
    fn serde_roundtrip() {
        let log = log_with(&["a", "b", "c"]);
        let json = serde_json::to_string(&log).unwrap();
        let decoded: NavigationLog = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded.current().unwrap().url, "c");
        assert!(decoded.can_go_back());
    }
}
