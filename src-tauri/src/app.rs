use std::time::Duration;

use tauri::{AppHandle, Manager, RunEvent};

use crate::auth::AuthManager;
use crate::commands;
use crate::db::Db;
use crate::error::Result;
use crate::model::MAIN_WEBVIEW_LABEL;
use crate::session::{Session, SessionFile};
use crate::settings::Settings;
use crate::state::AppState;
use crate::tabs::TabManager;

pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window(MAIN_WEBVIEW_LABEL) {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![
            commands::auth_status,
            commands::auth_complete_onboarding,
            commands::auth_unlock_password,
            commands::auth_unlock_passkey,
            commands::auth_set_password,
            commands::auth_remove_password,
            commands::auth_set_passkey,
            commands::auth_update_name,
            commands::startup_info,
            commands::tab_create,
            commands::tab_activate,
            commands::tab_close,
            commands::tab_close_others,
            commands::tab_close_right,
            commands::tab_duplicate,
            commands::tab_reorder,
            commands::navigate,
            commands::go_back,
            commands::go_forward,
            commands::reload,
            commands::hard_reload,
            commands::stop,
            commands::set_zoom,
            commands::zoom_in,
            commands::zoom_out,
            commands::zoom_reset,
            commands::chrome_layout_changed,
            commands::chrome_overlay_changed,
            commands::settings_get,
            commands::settings_set,
            commands::history_query,
            commands::history_delete,
            commands::history_clear,
            commands::history_frequent,
            commands::clear_browsing_data,
            commands::reopen_closed,
            commands::recently_closed_list,
            commands::show_chrome_page,
            commands::bookmarks_list,
            commands::bookmark_toggle,
            commands::bookmark_delete,
            commands::bookmark_edit,
            commands::bookmark_status,
            commands::downloads_list,
            commands::download_respond,
            commands::download_cancel,
            commands::download_retry,
            commands::download_open,
            commands::download_open_confirm,
            commands::download_reveal,
            commands::download_clear,
            commands::permission_respond,
            commands::permissions_list,
            commands::permission_reset,
            commands::permission_reset_all,
            commands::find_start,
            commands::find_next,
            commands::find_prev,
            commands::find_close,
            commands::tab_mute,
            commands::tab_discard,
        ])
        .register_uri_scheme_protocol("favicon", |ctx, request| {
            use tauri::http::{Response, StatusCode, header};
            let key = request
                .uri()
                .path()
                .trim_start_matches('/')
                .strip_suffix(".ico")
                .unwrap_or_default()
                .to_string();
            let state = ctx.app_handle().state::<AppState>();
            if !state.auth.is_unlocked() {
                return Response::builder()
                    .status(StatusCode::NOT_FOUND)
                    .body(Vec::new())
                    .unwrap();
            }
            match state.favicons.read_cached(&key) {
                Some(bytes) => Response::builder()
                    .header(header::CONTENT_TYPE, "image/x-icon")
                    .header(header::CACHE_CONTROL, "public, max-age=86400")
                    .body(bytes)
                    .unwrap(),
                None => Response::builder()
                    .status(StatusCode::NOT_FOUND)
                    .body(Vec::new())
                    .unwrap(),
            }
        })
        .setup(setup)
        .build(tauri::generate_context!())
        .expect("failed to build Rowster");

    builder.run(|app_handle, event| {
        // Flush the session synchronously on the way out; the debounced
        // saver may hold pending changes.
        if let RunEvent::ExitRequested { .. } = event {
            let _ = save_session_now(app_handle);
        }
    });
}

fn setup(app: &mut tauri::App) -> std::result::Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.handle().clone();

    // --- Persistence -----------------------------------------------------------------
    let data_dir = app_handle.path().app_data_dir()?;
    std::fs::create_dir_all(&data_dir)?;
    let db = Db::open(&data_dir)?;
    let auth = AuthManager::load(&data_dir)?;
    log::info!(
        "database at {}",
        data_dir.join(crate::db::DB_FILE_NAME).display()
    );

    let state = AppState {
        auth,
        browser_started: std::sync::Arc::new(std::sync::Mutex::new(false)),
        tabs: TabManager::new(),
        db: std::sync::Arc::new(db),
        settings: std::sync::Arc::new(std::sync::Mutex::new(Settings::default())),
        settings_write: std::sync::Arc::new(tokio::sync::Mutex::new(())),
        session: std::sync::Arc::new(Session::new(data_dir.clone())),
        permissions: std::sync::Arc::new(crate::permissions::PermissionBroker::default()),
        find: std::sync::Arc::new(crate::find::FindBroker::default()),
        favicons: std::sync::Arc::new(crate::favicons::FaviconCache::new(
            data_dir.join("favicons"),
        )),
        pending_executable_open: std::sync::Arc::new(std::sync::Mutex::new(
            std::collections::HashSet::new(),
        )),
    };

    // --- Session saver task (debounced) ----------------------------------------------
    let (session_tx, mut session_rx) = tokio::sync::mpsc::unbounded_channel::<()>();
    state.tabs.enable_session_saves(session_tx);
    {
        let saver_app = app_handle.clone();
        tauri::async_runtime::spawn(async move {
            while session_rx.recv().await.is_some() {
                tokio::time::sleep(Duration::from_millis(1500)).await;
                // Coalesce any triggers that arrived during the debounce.
                while session_rx.try_recv().is_ok() {}
                if let Err(e) = save_session_now(&saver_app) {
                    log::error!("session save failed: {e}");
                }
            }
        });
    }

    app.manage(state.clone());

    // --- Sleep sweeper: hides inactive tabs after the configured timeout ----
    {
        let sweeper = state.tabs.clone();
        let handle = app_handle.clone();
        std::thread::spawn(move || {
            loop {
                std::thread::sleep(std::time::Duration::from_secs(60));
                sweeper.sweep_sleeping(&handle);
            }
        });
    }

    // Profiles without a password do not need an unlock screen, but first-run
    // onboarding and password-protected profiles must create no tab webviews.
    if state.auth.is_unlocked() {
        ensure_browser_started(&app_handle)?;
    }

    // Keep tab webviews laid out below the chrome on window resizes.
    if let Some(window) = app_handle.get_window(MAIN_WEBVIEW_LABEL) {
        window.on_window_event(move |event| {
            if matches!(event, tauri::WindowEvent::Resized(_)) {
                let tabs = app_handle.state::<AppState>().tabs.clone();
                let _ = tabs.apply_layout(&app_handle);
            }
        });
    }
    Ok(())
}

/// Loads all protected startup state exactly once, after Rust authentication
/// has succeeded. This is the only path that restores or creates tab webviews.
pub(crate) fn ensure_browser_started(app: &AppHandle) -> Result<()> {
    let state = app.state::<AppState>();
    state.auth.require_unlocked()?;
    let mut started = crate::error::lock(&state.browser_started)?;
    if *started {
        return Ok(());
    }

    // Settings and history are intentionally untouched until this point.
    let settings = state.load_settings()?;
    let retention = settings.history_retention_days;
    if retention > 0 {
        let db = state.db.clone();
        std::thread::spawn(move || {
            if let Err(error) =
                db.with_conn(|conn| crate::repos::history::purge_older_than(conn, retention))
            {
                log::error!("history retention purge failed: {error}");
            }
        });
    }

    let restored = settings.restore_session && restore_session(app, &state)?;
    if !restored {
        let info = state.tabs.create(app)?;
        state.tabs.activate(app, info.id)?;
    }
    state.tabs.apply_layout(app)?;
    *started = true;
    Ok(())
}

/// Restores the saved session when present; returns whether anything was
/// restored.
fn restore_session(app: &AppHandle, state: &AppState) -> Result<bool> {
    let file = match state.session.load() {
        Ok(Some(file)) => file,
        Ok(None) => return Ok(false),
        Err(error) => {
            log::error!("session restore failed; opening a fresh tab: {error}");
            return Ok(false);
        }
    };
    let has_tabs = file.windows.iter().any(|w| !w.tabs.is_empty());
    if !has_tabs {
        return Ok(false);
    }
    let tabs = &state.tabs;
    tabs.restore_session(app, &file)?;
    log::info!("restored session with {} tabs", file.windows[0].tabs.len());
    Ok(true)
}

/// Serializes the current tab set and writes it atomically.
fn save_session_now(app: &AppHandle) -> Result<()> {
    let state = app.state::<AppState>();
    if !state.auth.is_unlocked() || !*crate::error::lock(&state.browser_started)? {
        return Ok(());
    }
    let file: SessionFile = state.tabs.session_file();
    state.session.save(&file)
}
