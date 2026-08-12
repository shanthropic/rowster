//! Download subsystem: engine `on_download` hooks, filename sanitization,
//! ask-before-download flow, and the command-facing manager.
//!
//! Flow on a requested download:
//! 1. Sanitize the suggested filename and compute a unique destination inside
//!    the configured download directory.
//! 2. When `ask_before_download` is on and the URL is not in the tab's
//!    one-shot bypass, the engine request is *cancelled* and chrome gets a
//!    `download_requested` prompt. If the user allows, the tab navigates to
//!    the URL again with the bypass set — the engine re-triggers the request
//!    and it is accepted. (Documented v1 trade-off: only GET navigations can
//!    be re-issued this way; the pre-start deferral API is Windows-only.)
//! 3. Otherwise the destination is set, the row is persisted, and chrome
//!    gets `download_started`.

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use crate::error::{Error, Result, lock};
use crate::events;
use crate::repos;
use crate::state::AppState;
use crate::tabs::TabManager;

/// Payload of the `download_requested` prompt (chrome dialog).
#[derive(Debug, Clone, serde::Serialize)]
pub struct DownloadRequestedPayload {
    pub id: i64,
    pub tab_id: u64,
    pub url: String,
    pub filename: String,
}

/// Entry point wired into every tab webview's `on_download` hook.
/// Returns whether the engine download should proceed.
pub fn on_download_requested(
    app: &AppHandle,
    tabs: &TabManager,
    tab_id: u64,
    url: &str,
    destination: &mut PathBuf,
) -> bool {
    let dest = match decide_destination(app, url) {
        Ok(dest) => dest,
        Err(e) => {
            log::error!("download request failed: {e}");
            return false;
        }
    };
    let filename = dest
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "download".into());

    // Ask-before-download prompt, unless the tab holds a one-shot bypass for
    // this exact URL (set when the user allowed the previous prompt).
    let pending_id = tabs.take_pending_download(tab_id, url);
    if settings(app).ask_before_download && pending_id.is_none() {
        let row = match insert_download(app, tab_id, url, &filename, None) {
            Ok(row) => row,
            Err(e) => {
                log::error!("download record failed: {e}");
                return false;
            }
        };
        if let Some(state) = app.try_state::<AppState>()
            && let Err(error) = state
                .db
                .with_conn(|conn| repos::downloads::mark_requested(conn, row.id))
        {
            log::error!("download prompt record failed: {error}");
            return false;
        }
        let _ = events::emit_to_chrome(
            app,
            events::EV_DOWNLOAD_REQUESTED,
            DownloadRequestedPayload {
                id: row.id,
                tab_id,
                url: url.to_string(),
                filename: row.filename.clone(),
            },
        );
        return false;
    }

    // Accept: point the engine at the unique destination and record it.
    *destination = dest.clone();
    let row = match pending_id {
        Some(id) => match start_pending_download(app, id, dest.to_str()) {
            Ok(row) => row,
            Err(e) => {
                log::error!("pending download start failed: {e}");
                return false;
            }
        },
        None => match insert_download(app, tab_id, url, &filename, dest.to_str()) {
            Ok(row) => row,
            Err(e) => {
                log::error!("download record failed: {e}");
                return false;
            }
        },
    };
    let _ = events::emit_to_chrome(app, events::EV_DOWNLOAD_STARTED, row.clone());
    log::info!("download started: {filename} → {}", dest.display());
    true
}

fn start_pending_download(
    app: &AppHandle,
    id: i64,
    path: Option<&str>,
) -> Result<repos::downloads::Download> {
    let Some(state) = app.try_state::<AppState>() else {
        return Err(Error::Other("state unavailable".into()));
    };
    state.db.with_conn(|conn| {
        repos::downloads::start_pending(conn, id, path)?;
        repos::downloads::by_id(conn, id)?
            .ok_or_else(|| Error::TabNotFound(format!("download {id}")))
    })
}

/// Engine hook for `on_download` Finished: finalize the row and notify.
pub fn on_download_finished(app: &AppHandle, url: &str, path: Option<&Path>, success: bool) {
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    let db = state.db.clone();
    let url = url.to_string();
    let path = path.map(Path::to_path_buf);
    let app = app.clone();
    std::thread::spawn(move || {
        let result: Result<Option<repos::downloads::Download>> = db.with_conn(|conn| {
            let row = match path.as_deref() {
                Some(path) => {
                    repos::downloads::active_by_path(conn, path.to_string_lossy().as_ref())?
                }
                None => repos::downloads::latest_by_url(conn, &url)?,
            };
            let Some(mut row) = row else {
                return Ok(None);
            };
            // Never downgrade an explicit cancel/failed state from a stray event.
            if row.status == "active" {
                let status = if success { "completed" } else { "failed" };
                let error = (!success).then(|| "download failed".to_string());
                repos::downloads::finish(conn, row.id, status, error.as_deref())?;
                row.status = status.to_string();
                Ok(Some(row))
            } else {
                Ok(None)
            }
        });
        match result {
            Ok(Some(row)) => {
                let _ = events::emit_to_chrome(
                    &app,
                    if success {
                        events::EV_DOWNLOAD_COMPLETED
                    } else {
                        events::EV_DOWNLOAD_FAILED
                    },
                    row.clone(),
                );
                if success && let Some(path) = row.path.clone() {
                    send_notification(&app, &row.filename, &path);
                }
            }
            Ok(None) => {}
            Err(e) => log::error!("download finish handling failed: {e}"),
        }
    });
}

fn insert_download(
    app: &AppHandle,
    tab_id: u64,
    url: &str,
    filename: &str,
    path: Option<&str>,
) -> Result<repos::downloads::Download> {
    let Some(state) = app.try_state::<AppState>() else {
        return Err(Error::Other("state unavailable".into()));
    };
    let db = state.db.clone();
    let url = url.to_string();
    let filename = filename.to_string();
    let path = path.map(String::from);
    db.with_conn(move |conn| {
        repos::downloads::insert(
            conn,
            Some(tab_id as i64),
            &url,
            &filename,
            path.as_deref(),
            None,
            None,
        )
    })
}

/// Decides the full destination path for a requested download.
pub fn decide_destination(app: &AppHandle, url: &str) -> Result<PathBuf> {
    let dir = download_dir(app)?;
    let name = filename_from_url(url);
    Ok(unique_destination(&dir, &name))
}

fn settings(app: &AppHandle) -> crate::settings::Settings {
    let Some(state) = app.try_state::<AppState>() else {
        return crate::settings::Settings::default();
    };
    lock(&state.settings)
        .map(|guard| guard.clone())
        .unwrap_or_default()
}

/// The configured download directory, falling back to the OS downloads dir.
fn download_dir(app: &AppHandle) -> Result<PathBuf> {
    let configured = settings(app).download_dir;
    if let Some(dir) = configured.filter(|d| !d.is_empty()) {
        let path = PathBuf::from(dir);
        std::fs::create_dir_all(&path)?;
        return Ok(path);
    }
    let fallback = app.path().download_dir().map_err(Error::from)?;
    std::fs::create_dir_all(&fallback)?;
    Ok(fallback)
}

/// Derives a safe filename from a URL's last path segment (query dropped,
/// percent-decoded, fallback `download`).
pub fn filename_from_url(url: &str) -> String {
    let parsed = url::Url::parse(url).ok();
    let raw = parsed
        .as_ref()
        .and_then(|u| u.path_segments())
        .and_then(|mut segments| segments.next_back())
        .filter(|s| !s.is_empty())
        .unwrap_or("download");
    sanitize_filename(&percent_decode(raw))
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%'
            && i + 2 < bytes.len()
            && let (Some(hi), Some(lo)) = (hex(bytes[i + 1]), hex(bytes[i + 2]))
        {
            out.push(hi * 16 + lo);
            i += 3;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn hex(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

/// Strips separators, traversal, and platform-illegal characters; keeps a
/// sane length and never produces `.`/`..`.
pub fn sanitize_filename(name: &str) -> String {
    let mut out: String = name
        .trim()
        .chars()
        .filter(|c| {
            !matches!(
                c,
                '/' | '\\' | '\0' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
            )
        })
        .take(120)
        .collect();
    // Windows strips trailing dots/spaces; normalize them away up front.
    while out.ends_with('.') || out.ends_with(' ') {
        out.pop();
    }
    if out.is_empty() || out == "." || out == ".." {
        out = "download".to_string();
    }
    out
}
/// Picks a path that does not exist yet: `name`, `name (1).ext`, …
pub fn unique_destination(dir: &Path, name: &str) -> PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let (stem, ext) = match name.rsplit_once('.') {
        Some((stem, ext)) if !ext.is_empty() => (stem.to_string(), format!(".{ext}")),
        _ => (name.to_string(), String::new()),
    };
    for n in 1..=999 {
        let candidate = dir.join(format!("{stem} ({n}){ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    // Give up uniqueness after 999 tries; the engine overwrites as a last
    // resort rather than failing the download.
    dir.join(format!(
        "{stem}-{}-{}",
        now_epoch_ms(),
        ext.trim_start_matches('.')
    ))
}

fn now_epoch_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn send_notification(app: &AppHandle, filename: &str, path: &str) {
    use tauri_plugin_notification::NotificationExt;
    let result = app
        .notification()
        .builder()
        .title("Download complete")
        .body(format!("{filename}\n{path}"))
        .show();
    if let Err(e) = result {
        log::warn!("download notification failed: {e}");
    }
}

/// Cancels an active download: stops tracking it and removes the partial
/// file. (Engine-level cancel is a Windows-only capability, documented in
/// LIMITATIONS.md; removing the partial file keeps the disk consistent.)
pub fn cancel(app: &AppHandle, id: i64) -> Result<()> {
    let Some(state) = app.try_state::<AppState>() else {
        return Err(Error::Other("state unavailable".into()));
    };
    let db = state.db.clone();
    let app = app.clone();
    let row = db
        .with_conn(|conn| repos::downloads::by_id(conn, id))?
        .ok_or_else(|| Error::TabNotFound(format!("download {id}")))?;
    if let Some(path) = row.path {
        // Partial file may already be gone; cancellation still succeeds.
        let _ = std::fs::remove_file(path);
    }
    db.with_conn(|conn| {
        repos::downloads::finish(conn, id, "cancelled", Some("cancelled by user"))
    })?;
    if let Some(row) = db.with_conn(|conn| repos::downloads::by_id(conn, id))? {
        events::emit_to_chrome(&app, events::EV_DOWNLOAD_CANCELLED, row)?;
    }
    Ok(())
}

/// Re-issues a download (retry / after an allow prompt) by navigating the
/// originating tab (or a fresh tab) to the URL with a one-shot bypass.
pub fn retry(app: &AppHandle, tabs: &TabManager, id: i64) -> Result<()> {
    let Some(state) = app.try_state::<AppState>() else {
        return Err(Error::Other("state unavailable".into()));
    };
    let db = state.db.clone();
    let row = db
        .with_conn(|conn| repos::downloads::by_id(conn, id))?
        .ok_or_else(|| Error::TabNotFound(format!("download {id}")))?;
    let url = row.url.clone();
    if let Some(tab_id) = row.tab_id
        && let Some(tab_id) = u64::try_from(tab_id).ok()
    {
        tabs.allow_next_download(tab_id, id, &url)?;
        return tabs.navigate(app, tab_id, &url);
    }
    tabs.create_with_url(app, &url)?;
    Ok(())
}

/// Whether `path` looks like an executable that needs an extra confirm step
/// before being opened.
pub fn is_executable(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .as_deref(),
        Some("exe")
            | Some("msi")
            | Some("bat")
            | Some("cmd")
            | Some("com")
            | Some("ps1")
            | Some("scr")
            | Some("jar")
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_traversal_and_separators() {
        // Separators are stripped so no path component can escape the dir;
        // remaining dots are harmless filename characters.
        assert_eq!(sanitize_filename("../../etc/passwd"), "....etcpasswd");
        assert_eq!(sanitize_filename("a\\b/c"), "abc");
    }

    #[test]
    fn sanitizes_windows_illegal_chars() {
        assert_eq!(sanitize_filename("na:me*?\"<>|.txt"), "name.txt");
    }

    #[test]
    fn empty_and_dot_names_fall_back() {
        assert_eq!(sanitize_filename(""), "download");
        assert_eq!(sanitize_filename("   "), "download");
        assert_eq!(sanitize_filename("."), "download");
        assert_eq!(sanitize_filename(".."), "download");
    }

    #[test]
    fn trailing_dot_is_trimmed() {
        assert_eq!(sanitize_filename("name."), "name");
    }

    #[test]
    fn url_filename_extracts_last_segment() {
        assert_eq!(
            filename_from_url("https://example.com/files/report.pdf?x=1"),
            "report.pdf"
        );
        assert_eq!(filename_from_url("https://example.com/"), "download");
        assert_eq!(filename_from_url("not a url"), "download");
    }

    #[test]
    fn url_filename_percent_decodes() {
        assert_eq!(
            filename_from_url("https://example.com/f%20o.pdf"),
            "f o.pdf"
        );
    }

    #[test]
    fn unique_destination_appends_counter() {
        let dir = std::env::temp_dir().join(format!("rowster-dl-test-{}", now_epoch_ms()));
        std::fs::create_dir_all(&dir).unwrap();
        let first = unique_destination(&dir, "file.zip");
        std::fs::write(&first, b"x").unwrap();
        let second = unique_destination(&dir, "file.zip");
        std::fs::write(&second, b"x").unwrap();
        assert_ne!(first, second);
        assert_eq!(first.file_name().unwrap().to_str(), Some("file.zip"));
        assert_eq!(second.file_name().unwrap().to_str(), Some("file (1).zip"));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn unique_destination_no_extension() {
        let dir = std::env::temp_dir().join(format!("rowster-dl-test2-{}", now_epoch_ms()));
        std::fs::create_dir_all(&dir).unwrap();
        let first = unique_destination(&dir, "readme");
        std::fs::write(&first, b"x").unwrap();
        let second = unique_destination(&dir, "readme");
        std::fs::write(&second, b"x").unwrap();
        assert_eq!(second.file_name().unwrap().to_str(), Some("readme (1)"));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn executable_extensions_detected() {
        assert!(is_executable(Path::new("C:\\x\\evil.exe")));
        assert!(is_executable(Path::new("script.bat")));
        assert!(!is_executable(Path::new("photo.jpg")));
        assert!(!is_executable(Path::new("archive.zip")));
    }
}
