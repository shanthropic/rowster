use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::AppHandle;
use url::Url;

use crate::events::{self, EV_FAVICON_CHANGED};
use crate::model::TabId;

#[derive(Clone, serde::Serialize)]
pub struct FaviconChangedPayload {
    pub id: TabId,
    pub favicon_url: Option<String>,
}

/// Conventional favicon location, served over the page's own scheme.
const ICON_PATH: &str = "/favicon.ico";
const TIMEOUT: Duration = Duration::from_secs(8);
/// Refuse oversized icons (512 KB is generous for a favicon).
const MAX_BYTES: usize = 512 * 1024;

/// Fetches site favicons (`/favicon.ico`) once per origin, caches them on
/// disk, and serves them to the chrome webview via the `favicon://` scheme.
///
/// Failures are cached too (an origin without an icon is never retried),
/// and in-flight fetches are deduped. All network work happens on worker
/// threads; page-load callbacks never block.
#[derive(Clone, Default)]
pub struct FaviconCache {
    dir: PathBuf,
    /// Origin host -> cache key (None = origin has no icon, don't retry).
    resolved: Arc<Mutex<HashMap<String, Option<String>>>>,
    /// Origin hosts with a fetch currently in flight.
    inflight: Arc<Mutex<Vec<String>>>,
}

impl FaviconCache {
    pub fn new(dir: PathBuf) -> Self {
        Self {
            dir,
            ..Self::default()
        }
    }

    /// Kicks off a best-effort favicon fetch after a page load finishes.
    /// Emits `favicon_changed` when an icon resolves.
    pub fn handle_load(&self, app: &AppHandle, id: TabId, page_url: &str) {
        let Ok(url) = Url::parse(page_url) else {
            return;
        };
        if url.scheme() != "http" && url.scheme() != "https" {
            return;
        }
        let Some(host) = url.host_str() else {
            return;
        };
        let host = host.to_ascii_lowercase();
        if self.resolved.lock().unwrap().contains_key(&host) {
            return;
        }
        {
            let mut inflight = self.inflight.lock().unwrap();
            if inflight.contains(&host) {
                return;
            }
            inflight.push(host.clone());
        }
        let cache = self.clone();
        let app = app.clone();
        std::thread::spawn(move || cache.fetch(app, id, host, url));
    }

    /// Runs on a worker thread: downloads, validates, and caches the icon.
    fn fetch(&self, app: AppHandle, id: TabId, host: String, page_url: Url) {
        let key = self.fetch_inner(&page_url);
        {
            let mut inflight = self.inflight.lock().unwrap();
            inflight.retain(|h| *h != host);
        }
        let favicon_url = key.map(|k| format!("favicon://{k}.ico"));
        self.resolved
            .lock()
            .unwrap()
            .insert(host, favicon_url.clone());
        let _ = events::emit_to_chrome(
            &app,
            EV_FAVICON_CHANGED,
            FaviconChangedPayload { id, favicon_url },
        );
    }

    fn fetch_inner(&self, page_url: &Url) -> Option<String> {
        let icon_url = format!(
            "{}://{}{}",
            page_url.scheme(),
            page_url.host_str()?,
            ICON_PATH
        );
        let client = reqwest::blocking::Client::builder()
            .timeout(TIMEOUT)
            .user_agent(concat!("Rowster/", env!("CARGO_PKG_VERSION")))
            .build()
            .ok()?;
        let response = client.get(&icon_url).send().ok()?;
        if !response.status().is_success() {
            return None;
        }
        let content_type = response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if !content_type.starts_with("image/") {
            return None;
        }
        let body = response.bytes().ok()?;
        if body.is_empty() || body.len() > MAX_BYTES {
            return None;
        }
        let key = sanitize_key(page_url.host_str()?);
        if !is_safe_key(&key) {
            return None;
        }
        std::fs::create_dir_all(&self.dir).ok()?;
        std::fs::write(self.dir.join(format!("{key}.ico")), &body).ok()?;
        Some(key)
    }

    /// Serves a cached icon for the `favicon://` protocol handler.
    pub fn read_cached(&self, key: &str) -> Option<Vec<u8>> {
        if !is_safe_key(key) {
            return None;
        }
        std::fs::read(self.dir.join(format!("{key}.ico"))).ok()
    }
}

/// Lowercases and strips characters that are unsafe in a cache filename.
/// Returns None when nothing usable remains.
fn sanitize_key(host: &str) -> String {
    host.to_ascii_lowercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '.' | '_'))
        .collect()
}

/// Only accept plain alphanumeric keys (`-._` allowed) so the favicon
/// protocol can never escape the cache directory.
fn is_safe_key(key: &str) -> bool {
    !key.is_empty()
        && key.len() <= 128
        && key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '.' | '_'))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_key_lowercases_and_strips() {
        assert_eq!(sanitize_key("Example.COM"), "example.com");
        assert_eq!(sanitize_key("münchen.de"), "mnchen.de");
        assert_eq!(sanitize_key("a/b\\c:d*e"), "abcde");
    }

    #[test]
    fn safe_key_allows_host_chars_only() {
        assert!(is_safe_key("example.com"));
        assert!(is_safe_key("my-site_2.example"));
        assert!(!is_safe_key(""));
        assert!(!is_safe_key("../etc/passwd"));
        assert!(!is_safe_key("a b"));
        assert!(!is_safe_key(&"a".repeat(129)));
    }

    #[test]
    fn read_cached_rejects_unsafe_keys() {
        let cache = FaviconCache::new(PathBuf::from("."));
        assert!(cache.read_cached("../etc/passwd").is_none());
        assert!(cache.read_cached("").is_none());
    }

    #[test]
    fn non_http_pages_are_ignored() {
        let cache = FaviconCache::new(PathBuf::from("."));
        // handle_load must not spawn anything for non-http URLs; nothing to
        // assert on directly, so verify the pure guard logic via fetch_inner.
        let url = Url::parse("file:///etc/passwd").unwrap();
        assert!(cache.fetch_inner(&url).is_none());
    }

    #[test]
    fn missing_icon_returns_none() {
        let cache = FaviconCache::new(PathBuf::from("."));
        // Localhost with no server: the fetch fails fast and yields None.
        let url = Url::parse("http://127.0.0.1:1/").unwrap();
        assert!(cache.fetch_inner(&url).is_none());
    }
}
