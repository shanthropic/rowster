use tauri::{AppHandle, Manager, Webview};

use crate::error::{Error, Result, lock};
use crate::events;
use crate::layout::Layout;
use crate::model::{BrowserSnapshot, ChromePage, ClosedTab, TabInfo};
use crate::repos;
use crate::repos::permissions::SitePermission;
use crate::security::caller;
use crate::settings::{Settings, SettingsPatch};
use crate::state::AppState;
use crate::tabs::TabManager;

/// Every command must originate from the trusted chrome webview. Tab
/// webviews hold zero capabilities, and this guard is the second layer.
fn manager(app: &AppHandle) -> TabManager {
    app.state::<AppState>().tabs.clone()
}

/// Runs `f` with the shared database connection on a blocking thread
/// (commands are async; SQLite must never touch the async runtime).
async fn with_db<T: Send + 'static>(
    app: &AppHandle,
    f: impl FnOnce(&rusqlite::Connection) -> Result<T> + Send + 'static,
) -> Result<T> {
    let db = app.state::<AppState>().db.clone();
    tauri::async_runtime::spawn_blocking(move || db.with_conn(f))
        .await
        .map_err(|e| crate::error::Error::Other(e.to_string()))?
}

#[tauri::command]
pub async fn startup_info(app: AppHandle, webview: Webview) -> Result<BrowserSnapshot> {
    caller::assert_chrome(&webview)?;
    Ok(manager(&app).snapshot())
}

#[tauri::command]
pub async fn tab_create(app: AppHandle, webview: Webview) -> Result<TabInfo> {
    caller::assert_chrome(&webview)?;
    let manager = manager(&app);
    let info = manager.create(&app)?;
    manager.activate(&app, info.id)?;
    manager.emit_snapshot(&app)?;
    Ok(manager
        .snapshot()
        .windows
        .first()
        .and_then(|window| window.tabs.iter().find(|tab| tab.id == info.id))
        .cloned()
        .unwrap_or(info))
}

#[tauri::command]
pub async fn tab_activate(app: AppHandle, webview: Webview, id: u64) -> Result<()> {
    caller::assert_chrome(&webview)?;
    manager(&app).activate(&app, id)
}

#[tauri::command]
pub async fn tab_close(app: AppHandle, webview: Webview, id: u64) -> Result<()> {
    caller::assert_chrome(&webview)?;
    let manager = manager(&app);
    manager.close(&app, id)?;
    let is_empty = manager
        .snapshot()
        .windows
        .first()
        .is_none_or(|window| window.tabs.is_empty());
    if is_empty {
        let action = lock(&app.state::<AppState>().settings)?.close_last_tab_action;
        match action {
            crate::settings::CloseLastTabAction::NewTab => {
                let info = manager.create(&app)?;
                manager.activate(&app, info.id)?;
            }
            crate::settings::CloseLastTabAction::CloseWindow => {
                let window = app
                    .get_webview_window(crate::model::MAIN_WEBVIEW_LABEL)
                    .ok_or_else(|| {
                        Error::WindowNotFound(crate::model::MAIN_WEBVIEW_LABEL.into())
                    })?;
                window.close()?;
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn tab_close_others(app: AppHandle, webview: Webview, id: u64) -> Result<()> {
    caller::assert_chrome(&webview)?;
    manager(&app).close_others(&app, id)
}

#[tauri::command]
pub async fn tab_close_right(app: AppHandle, webview: Webview, id: u64) -> Result<()> {
    caller::assert_chrome(&webview)?;
    manager(&app).close_right(&app, id)
}

#[tauri::command]
pub async fn tab_duplicate(app: AppHandle, webview: Webview, id: u64) -> Result<TabInfo> {
    caller::assert_chrome(&webview)?;
    let manager = manager(&app);
    let source = manager
        .snapshot()
        .windows
        .first()
        .and_then(|window| window.tabs.iter().find(|tab| tab.id == id))
        .cloned()
        .ok_or_else(|| Error::TabNotFound(id.to_string()))?;
    let duplicated = if source.is_new {
        manager.create(&app)?
    } else {
        manager.create_with_url(&app, &source.url)?
    };
    manager.set_zoom(&app, duplicated.id, source.zoom)?;
    if source.muted {
        manager.set_muted(&app, duplicated.id, true)?;
    }
    manager.activate(&app, duplicated.id)?;
    Ok(manager
        .snapshot()
        .windows
        .first()
        .and_then(|window| window.tabs.iter().find(|tab| tab.id == duplicated.id))
        .cloned()
        .unwrap_or(duplicated))
}

#[tauri::command]
pub async fn tab_reorder(
    app: AppHandle,
    webview: Webview,
    id: u64,
    before_id: Option<u64>,
) -> Result<()> {
    caller::assert_chrome(&webview)?;
    manager(&app).reorder(&app, id, before_id)
}

#[tauri::command]
pub async fn navigate(app: AppHandle, webview: Webview, id: u64, address: String) -> Result<()> {
    caller::assert_chrome(&webview)?;
    manager(&app).navigate(&app, id, &address)
}

#[tauri::command]
pub async fn go_back(app: AppHandle, webview: Webview, id: u64) -> Result<bool> {
    caller::assert_chrome(&webview)?;
    manager(&app).go_back(&app, id)
}

#[tauri::command]
pub async fn go_forward(app: AppHandle, webview: Webview, id: u64) -> Result<bool> {
    caller::assert_chrome(&webview)?;
    manager(&app).go_forward(&app, id)
}

#[tauri::command]
pub async fn reload(app: AppHandle, webview: Webview, id: u64) -> Result<()> {
    caller::assert_chrome(&webview)?;
    manager(&app).reload(&app, id)
}

#[tauri::command]
pub async fn hard_reload(app: AppHandle, webview: Webview, id: u64) -> Result<()> {
    caller::assert_chrome(&webview)?;
    manager(&app).hard_reload(&app, id)
}

#[tauri::command]
pub async fn stop(app: AppHandle, webview: Webview, id: u64) -> Result<()> {
    caller::assert_chrome(&webview)?;
    manager(&app).stop(&app, id)
}

#[tauri::command]
pub async fn set_zoom(app: AppHandle, webview: Webview, id: u64, factor: f64) -> Result<f64> {
    caller::assert_chrome(&webview)?;
    manager(&app).set_zoom(&app, id, factor)
}

#[tauri::command]
pub async fn zoom_in(app: AppHandle, webview: Webview, id: u64) -> Result<f64> {
    caller::assert_chrome(&webview)?;
    manager(&app).zoom_in(&app, id)
}

#[tauri::command]
pub async fn zoom_out(app: AppHandle, webview: Webview, id: u64) -> Result<f64> {
    caller::assert_chrome(&webview)?;
    manager(&app).zoom_out(&app, id)
}

#[tauri::command]
pub async fn zoom_reset(app: AppHandle, webview: Webview, id: u64) -> Result<f64> {
    caller::assert_chrome(&webview)?;
    manager(&app).zoom_reset(&app, id)
}

#[tauri::command]
pub async fn chrome_layout_changed(
    app: AppHandle,
    webview: Webview,
    top: f64,
    bottom: f64,
    left: f64,
    right: f64,
) -> Result<Layout> {
    caller::assert_chrome(&webview)?;
    log::info!("chrome layout report: top={top} bottom={bottom}");
    let layout = Layout {
        top,
        bottom,
        left,
        right,
    };
    let sanitized = manager(&app).set_layout(layout);
    manager(&app).apply_layout(&app)?;
    Ok(sanitized)
}

#[tauri::command]
pub async fn chrome_overlay_changed(webview: Webview, app: AppHandle, open: bool) -> Result<()> {
    caller::assert_chrome(&webview)?;
    manager(&app).set_chrome_overlay_open(open)
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn settings_get(app: AppHandle, webview: Webview) -> Result<Settings> {
    caller::assert_chrome(&webview)?;
    let state = app.state::<AppState>();
    let settings = lock(&state.settings)?;
    Ok(settings.clone())
}

#[tauri::command]
pub async fn settings_set(
    app: AppHandle,
    webview: Webview,
    patch: SettingsPatch,
) -> Result<Settings> {
    caller::assert_chrome(&webview)?;
    let state = app.state::<AppState>();
    let _write = state.settings_write.lock().await;
    let mut updated = lock(&state.settings)?.clone();
    updated.apply(patch)?;
    let db = state.db.clone();
    let persisted = updated.clone();
    tauri::async_runtime::spawn_blocking(move || {
        db.with_conn(|conn| repos::settings::save(conn, &persisted))
    })
    .await
    .map_err(|e| Error::Other(e.to_string()))??;
    *lock(&state.settings)? = updated.clone();

    let _ = events::emit_to_chrome(&app, events::EV_SETTINGS_CHANGED, updated.clone());
    Ok(updated)
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn history_query(
    app: AppHandle,
    webview: Webview,
    q: Option<String>,
    limit: Option<u64>,
) -> Result<Vec<repos::history::HistoryEntry>> {
    caller::assert_chrome(&webview)?;
    with_db(&app, move |conn| {
        repos::history::query(conn, q.as_deref(), limit.unwrap_or(100))
    })
    .await
}

#[tauri::command]
pub async fn history_frequent(
    app: AppHandle,
    webview: Webview,
    limit: Option<u64>,
) -> Result<Vec<repos::history::HistoryEntry>> {
    caller::assert_chrome(&webview)?;
    with_db(&app, move |conn| {
        repos::history::frequent(conn, limit.unwrap_or(12))
    })
    .await
}

#[tauri::command]
pub async fn history_delete(app: AppHandle, webview: Webview, id: i64) -> Result<bool> {
    caller::assert_chrome(&webview)?;
    with_db(&app, move |conn| repos::history::delete(conn, id)).await
}

#[tauri::command]
pub async fn history_clear(app: AppHandle, webview: Webview) -> Result<u64> {
    caller::assert_chrome(&webview)?;
    with_db(&app, |conn| repos::history::clear(conn, None)).await
}

/// Clears browsing data for the requested kinds ("history", "bookmarks",
/// "downloads", "permissions"). Returns the total number of removed rows.
#[tauri::command]
pub async fn clear_browsing_data(
    app: AppHandle,
    webview: Webview,
    kinds: Vec<String>,
) -> Result<u64> {
    caller::assert_chrome(&webview)?;
    let state = app.state::<AppState>();
    let mut removed: u64 = 0;
    for kind in kinds {
        match kind.as_str() {
            "history" => {
                removed += with_db(&app, |conn| repos::history::clear(conn, None)).await?;
            }
            "bookmarks" => {
                removed += with_db(&app, repos::bookmarks::clear).await?;
                events::emit_to_chrome(&app, events::EV_BOOKMARKS_CHANGED, ())?;
            }
            "downloads" => {
                removed += with_db(&app, repos::downloads::clear_finished).await?;
            }
            "permissions" => {
                removed += with_db(&app, repos::permissions::clear_all).await?;
                state.permissions.clear();
            }
            _ => return Err(Error::Other(format!("unknown browsing data kind: {kind}"))),
        }
    }
    let _ = state.tabs.emit_snapshot(&app);
    Ok(removed)
}

// ---------------------------------------------------------------------------
// Session / recently closed
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn reopen_closed(app: AppHandle, webview: Webview) -> Result<Option<TabInfo>> {
    caller::assert_chrome(&webview)?;
    manager(&app).reopen_closed(&app)
}

#[tauri::command]
pub async fn recently_closed_list(app: AppHandle, webview: Webview) -> Result<Vec<ClosedTab>> {
    caller::assert_chrome(&webview)?;
    Ok(manager(&app).recently_closed_list())
}

/// Shows or dismisses a chrome-local page (settings/history) on the active
/// tab. Chrome pages are rendered by the chrome webview as overlays.
#[tauri::command]
pub async fn show_chrome_page(
    app: AppHandle,
    webview: Webview,
    page: Option<ChromePage>,
) -> Result<()> {
    caller::assert_chrome(&webview)?;
    manager(&app).set_chrome_page(&app, page)
}

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn bookmarks_list(
    app: AppHandle,
    webview: Webview,
    q: Option<String>,
) -> Result<Vec<crate::repos::bookmarks::Bookmark>> {
    caller::assert_chrome(&webview)?;
    let q = q.map(|q| q.trim().to_string()).filter(|q| !q.is_empty());
    with_db(&app, move |conn| match &q {
        Some(q) => crate::repos::bookmarks::search(conn, q, 500),
        None => crate::repos::bookmarks::query(conn),
    })
    .await
}

/// Star toggle: adds the URL as a bookmark, or removes it when already
/// bookmarked. Returns the bookmark after the operation (None = removed).
#[tauri::command]
pub async fn bookmark_toggle(
    app: AppHandle,
    webview: Webview,
    url: String,
    title: String,
) -> Result<Option<crate::repos::bookmarks::Bookmark>> {
    caller::assert_chrome(&webview)?;
    let url = validate_web_url(&url)?;
    let result = with_db(&app, move |conn| {
        if let Some(id) = crate::repos::bookmarks::delete_by_url(conn, &url)? {
            return Ok((None, id));
        }
        let bookmark = crate::repos::bookmarks::add(conn, None, &title, &url)?;
        Ok((Some(bookmark.clone()), bookmark.id))
    })
    .await?;
    let _ = events::emit_to_chrome(&app, events::EV_BOOKMARKS_CHANGED, ());
    Ok(result.0)
}

#[tauri::command]
pub async fn bookmark_delete(app: AppHandle, webview: Webview, id: i64) -> Result<bool> {
    caller::assert_chrome(&webview)?;
    let deleted = with_db(&app, move |conn| crate::repos::bookmarks::delete(conn, id)).await?;
    if deleted {
        let _ = events::emit_to_chrome(&app, events::EV_BOOKMARKS_CHANGED, ());
    }
    Ok(deleted)
}

#[tauri::command]
pub async fn bookmark_edit(
    app: AppHandle,
    webview: Webview,
    id: i64,
    title: String,
    url: String,
) -> Result<bool> {
    caller::assert_chrome(&webview)?;
    let url = validate_web_url(&url)?;
    let updated = with_db(&app, move |conn| {
        crate::repos::bookmarks::update(conn, id, &title, &url)
    })
    .await?;
    if updated {
        let _ = events::emit_to_chrome(&app, events::EV_BOOKMARKS_CHANGED, ());
    }
    Ok(updated)
}

#[tauri::command]
pub async fn bookmark_status(app: AppHandle, webview: Webview, url: String) -> Result<bool> {
    caller::assert_chrome(&webview)?;
    with_db(&app, move |conn| {
        crate::repos::bookmarks::is_bookmarked(conn, &url)
    })
    .await
}

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn downloads_list(
    app: AppHandle,
    webview: Webview,
    limit: Option<u64>,
) -> Result<Vec<crate::repos::downloads::Download>> {
    caller::assert_chrome(&webview)?;
    with_db(&app, move |conn| {
        crate::repos::downloads::list(conn, limit.unwrap_or(200))
    })
    .await
}

/// User decision on an ask-before-download prompt. Allow re-navigates the
/// tab to the URL (with the bypass set); Block cancels the pending row.
#[tauri::command]
pub async fn download_respond(
    app: AppHandle,
    webview: Webview,
    id: i64,
    allow: bool,
) -> Result<()> {
    caller::assert_chrome(&webview)?;
    if allow {
        crate::downloads::retry(&app, &manager(&app), id)?;
    } else {
        crate::downloads::cancel(&app, id)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn download_cancel(app: AppHandle, webview: Webview, id: i64) -> Result<()> {
    caller::assert_chrome(&webview)?;
    crate::downloads::cancel(&app, id)
}

#[tauri::command]
pub async fn download_retry(app: AppHandle, webview: Webview, id: i64) -> Result<()> {
    caller::assert_chrome(&webview)?;
    crate::downloads::retry(&app, &manager(&app), id)
}

/// Opens a finished download with the OS default app. Executables are not
/// opened directly: a `download_open_confirm` event asks chrome first, and
/// the actual open happens via `download_open_confirm`.
#[tauri::command]
pub async fn download_open(app: AppHandle, webview: Webview, id: i64) -> Result<bool> {
    caller::assert_chrome(&webview)?;
    let row = with_db(&app, move |conn| crate::repos::downloads::by_id(conn, id))
        .await?
        .ok_or_else(|| Error::TabNotFound(format!("download {id}")))?;
    let path = row
        .path
        .ok_or_else(|| Error::Other("download has no file".into()))?;
    let path_buf = std::path::PathBuf::from(&path);
    if !path_buf.exists() {
        return Err(Error::Other(format!("file not found: {path}")));
    }
    if crate::downloads::is_executable(&path_buf) {
        lock(&app.state::<AppState>().pending_executable_open)?.insert(id);
        #[derive(Clone, serde::Serialize)]
        struct ConfirmPayload {
            id: i64,
            path: String,
            filename: String,
        }
        let _ = events::emit_to_chrome(
            &app,
            events::EV_DOWNLOAD_OPEN_CONFIRM,
            ConfirmPayload {
                id,
                path: path.clone(),
                filename: row.filename.clone(),
            },
        );
        return Ok(true);
    }
    tauri_plugin_opener::open_path(path, None::<&str>).map_err(Error::from)?;
    Ok(false)
}

#[tauri::command]
pub async fn download_open_confirm(app: AppHandle, webview: Webview, id: i64) -> Result<()> {
    caller::assert_chrome(&webview)?;
    if !lock(&app.state::<AppState>().pending_executable_open)?.remove(&id) {
        return Err(Error::Other("executable open confirmation expired".into()));
    }
    let row = with_db(&app, move |conn| crate::repos::downloads::by_id(conn, id))
        .await?
        .ok_or_else(|| Error::TabNotFound(format!("download {id}")))?;
    let path = row
        .path
        .ok_or_else(|| Error::Other("download has no file".into()))?;
    tauri_plugin_opener::open_path(path, None::<&str>).map_err(Error::from)
}

#[tauri::command]
pub async fn download_reveal(app: AppHandle, webview: Webview, id: i64) -> Result<()> {
    caller::assert_chrome(&webview)?;
    let row = with_db(&app, move |conn| crate::repos::downloads::by_id(conn, id))
        .await?
        .ok_or_else(|| Error::TabNotFound(format!("download {id}")))?;
    let path = row
        .path
        .ok_or_else(|| Error::Other("download has no file".into()))?;
    tauri_plugin_opener::reveal_item_in_dir(path).map_err(Error::from)
}

#[tauri::command]
pub async fn download_clear(app: AppHandle, webview: Webview) -> Result<u64> {
    caller::assert_chrome(&webview)?;
    with_db(&app, crate::repos::downloads::clear_finished).await
}

#[tauri::command]
pub async fn permission_respond(
    app: AppHandle,
    webview: Webview,
    origin: String,
    kind: crate::repos::permissions::PermissionKind,
    decision: crate::repos::permissions::PermissionDecision,
) -> Result<()> {
    caller::assert_chrome(&webview)?;
    let origin = crate::permissions::canonical_origin(&origin)
        .ok_or_else(|| Error::Other("permission origin must be an http(s) origin".into()))?;
    match decision {
        crate::repos::permissions::PermissionDecision::AlwaysAllow
        | crate::repos::permissions::PermissionDecision::Block => {
            with_db(&app, move |conn| {
                crate::repos::permissions::set(conn, &origin, kind, decision)
            })
            .await?;
        }
        crate::repos::permissions::PermissionDecision::AllowOnce => {
            app.state::<AppState>()
                .permissions
                .record_once(&origin, kind);
        }
    }
    Ok(())
}

fn validate_web_url(input: &str) -> Result<String> {
    let url = url::Url::parse(input.trim())?;
    crate::security::nav_policy::validate(&url)
        .map_err(|error| Error::NavigationBlocked(error.to_string()))?;
    Ok(url.to_string())
}

#[tauri::command]
pub async fn permissions_list(app: AppHandle, webview: Webview) -> Result<Vec<SitePermission>> {
    caller::assert_chrome(&webview)?;
    with_db(&app, crate::repos::permissions::list).await
}

#[tauri::command]
pub async fn permission_reset(
    app: AppHandle,
    webview: Webview,
    origin: String,
    kind: crate::repos::permissions::PermissionKind,
) -> Result<()> {
    caller::assert_chrome(&webview)?;
    let origin = crate::permissions::canonical_origin(&origin)
        .ok_or_else(|| Error::Other("permission origin must be an http(s) origin".into()))?;
    let persisted_origin = origin.clone();
    with_db(&app, move |conn| {
        crate::repos::permissions::clear(conn, &persisted_origin, kind)
    })
    .await?;
    app.state::<AppState>().permissions.reset(&origin, kind);
    Ok(())
}

#[tauri::command]
pub async fn permission_reset_all(app: AppHandle, webview: Webview) -> Result<u64> {
    caller::assert_chrome(&webview)?;
    let removed = with_db(&app, crate::repos::permissions::clear_all).await?;
    app.state::<AppState>().permissions.clear();
    Ok(removed)
}

#[tauri::command]
pub async fn find_start(
    app: AppHandle,
    webview: Webview,
    id: u64,
    query: String,
    case_sensitive: bool,
) -> Result<crate::find::FindStatus> {
    caller::assert_chrome(&webview)?;
    crate::find::start(&app, id, &query, case_sensitive)
}

#[tauri::command]
pub async fn find_next(app: AppHandle, webview: Webview, id: u64) -> Result<()> {
    caller::assert_chrome(&webview)?;
    crate::find::step(&app, id, false)
}

#[tauri::command]
pub async fn find_prev(app: AppHandle, webview: Webview, id: u64) -> Result<()> {
    caller::assert_chrome(&webview)?;
    crate::find::step(&app, id, true)
}

#[tauri::command]
pub async fn find_close(app: AppHandle, webview: Webview, id: u64) -> Result<()> {
    caller::assert_chrome(&webview)?;
    crate::find::close(&app, id)
}

#[tauri::command]
pub async fn tab_mute(app: AppHandle, webview: Webview, id: u64, muted: bool) -> Result<()> {
    caller::assert_chrome(&webview)?;
    manager(&app).set_muted(&app, id, muted)
}

#[tauri::command]
pub async fn tab_discard(app: AppHandle, webview: Webview, id: u64) -> Result<()> {
    caller::assert_chrome(&webview)?;
    manager(&app).discard(&app, id)
}
