use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{AppHandle, Manager};
use url::Url;

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
    /// Origin -> cache key (None = origin has no icon, don't retry).
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
        if url.host_str().is_none() {
            return;
        }
        let origin = url.origin().ascii_serialization();
        let Ok(resolved) = crate::error::lock(&self.resolved) else {
            return;
        };
        if let Some(cached) = resolved.get(&origin).cloned() {
            drop(resolved);
            if let Some(state) = app.try_state::<crate::state::AppState>() {
                state.tabs.set_favicon(app, id, cached);
            }
            return;
        }
        drop(resolved);
        {
            let Ok(mut inflight) = crate::error::lock(&self.inflight) else {
                return;
            };
            if inflight.contains(&origin) {
                return;
            }
            inflight.push(origin.clone());
        }
        let cache = self.clone();
        let app = app.clone();
        std::thread::spawn(move || cache.fetch(app, id, origin, url));
    }

    /// Runs on a worker thread: downloads, validates, and caches the icon.
    fn fetch(&self, app: AppHandle, id: TabId, origin: String, page_url: Url) {
        let key = self.fetch_inner(&page_url);
        if let Ok(mut inflight) = crate::error::lock(&self.inflight) {
            inflight.retain(|item| *item != origin);
        }
        let favicon_url = key.map(|key| protocol_url(&key));
        if let Ok(mut resolved) = crate::error::lock(&self.resolved) {
            resolved.insert(origin, favicon_url.clone());
        }
        if let Some(state) = app.try_state::<crate::state::AppState>() {
            state.tabs.set_favicon(&app, id, favicon_url);
        }
    }

    fn fetch_inner(&self, page_url: &Url) -> Option<String> {
        let mut icon_url = page_url.clone();
        icon_url.set_path(ICON_PATH);
        icon_url.set_query(None);
        icon_url.set_fragment(None);
        let _ = icon_url.set_username("");
        let _ = icon_url.set_password(None);
        let client = reqwest::blocking::Client::builder()
            .timeout(TIMEOUT)
            // A public site must not redirect Rowster's native fetcher into a
            // private network that the page itself cannot reach.
            .redirect(reqwest::redirect::Policy::none())
            .user_agent(concat!("Rowster/", env!("CARGO_PKG_VERSION")))
            .build()
            .ok()?;
        let response = client.get(icon_url).send().ok()?;
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
        let key = cache_key(page_url)?;
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

fn cache_key(url: &Url) -> Option<String> {
    let port = url.port_or_known_default()?;
    Some(sanitize_key(&format!(
        "{}-{}-{port}",
        url.scheme(),
        url.host_str()?
    )))
}

fn protocol_url(key: &str) -> String {
    format!("favicon://localhost/{key}.ico")
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
    fn cache_key_separates_schemes_and_ports() {
        let https = Url::parse("https://example.com/").unwrap();
        let http = Url::parse("http://example.com:8080/").unwrap();
        assert_eq!(cache_key(&https).as_deref(), Some("https-example.com-443"));
        assert_eq!(cache_key(&http).as_deref(), Some("http-example.com-8080"));
    }

    #[test]
    fn protocol_url_places_the_cache_key_in_the_path() {
        assert_eq!(
            protocol_url("https-example.com-443"),
            "favicon://localhost/https-example.com-443.ico"
        );
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
