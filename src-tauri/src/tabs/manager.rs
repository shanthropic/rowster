use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use tauri::webview::{PageLoadEvent, WebviewBuilder};
use tauri::{AppHandle, Manager, WebviewUrl};
use tokio::sync::mpsc::UnboundedSender;
use url::Url;

use crate::address::Address;
use crate::error::{Error, Result, lock};
use crate::events;
use crate::layout::Layout;
use crate::model::{
    BrowserSnapshot, BrowserWindowInfo, ChromePage, ClosedTab, IdPayload, LoadingChangedPayload,
    MAIN_WEBVIEW_LABEL, MAIN_WINDOW_ID, NavStateChangedPayload, TAB_WEBVIEW_PREFIX, TabId, TabInfo,
    TitleChangedPayload, UrlChangedPayload, ZoomChangedPayload,
};
use crate::repos;
use crate::security::nav_policy;
use crate::session::{SessionFile, SessionTab, SessionWindow};
use crate::tabs::tab::Tab;
use crate::webview::handle::{LiveWebview, WebviewHandle};

const ABOUT_BLANK: &str = "about:blank";
const RECENTLY_CLOSED_CAP: usize = 25;

#[derive(Clone)]
pub struct TabManager {
    inner: Arc<Inner>,
}

struct Inner {
    tabs: Mutex<HashMap<TabId, Tab>>,
    /// Display order of tab ids (left to right in the tab strip).
    order: Mutex<Vec<TabId>>,
    active: Mutex<Option<TabId>>,
    next_id: AtomicU64,
    layout: Mutex<Layout>,
    /// Native child webviews sit above chrome; hide the active child while a
    /// chrome dialog or popover extends into the content region.
    chrome_overlay_open: Mutex<bool>,
    /// Closed tabs kept for "Reopen closed tab" (most recent first).
    recently_closed: Mutex<VecDeque<ClosedTab>>,
    /// Trigger for the debounced session-save task (`None` before setup).
    session_signal: Mutex<Option<UnboundedSender<()>>>,
}

impl Default for TabManager {
    fn default() -> Self {
        Self::new()
    }
}

impl TabManager {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Inner {
                tabs: Mutex::new(HashMap::new()),
                order: Mutex::new(Vec::new()),
                active: Mutex::new(None),
                next_id: AtomicU64::new(0),
                layout: Mutex::new(Layout::default()),
                chrome_overlay_open: Mutex::new(false),
                recently_closed: Mutex::new(VecDeque::new()),
                session_signal: Mutex::new(None),
            }),
        }
    }

    // ------------------------------------------------------------------
    // Queries
    // ------------------------------------------------------------------

    pub fn snapshot(&self) -> BrowserSnapshot {
        let Ok(tabs) = lock(&self.inner.tabs) else {
            return BrowserSnapshot::default();
        };
        let Ok(order) = lock(&self.inner.order) else {
            return BrowserSnapshot::default();
        };
        let Ok(active_guard) = lock(&self.inner.active) else {
            return BrowserSnapshot::default();
        };
        let active = *active_guard;

        let tab_infos: Vec<TabInfo> = order
            .iter()
            .filter_map(|id| tabs.get(id))
            .map(|tab| tab.to_info(Some(tab.id) == active))
            .collect();

        BrowserSnapshot {
            windows: vec![BrowserWindowInfo {
                id: MAIN_WINDOW_ID,
                active_tab_id: active,
                tabs: tab_infos,
            }],
        }
    }

    pub fn active_id(&self) -> Option<TabId> {
        lock(&self.inner.active).ok().and_then(|active| *active)
    }

    pub fn layout(&self) -> Layout {
        lock(&self.inner.layout).map(|l| *l).unwrap_or_default()
    }

    fn nav_state(&self, id: TabId) -> Result<(bool, bool)> {
        let tabs = lock(&self.inner.tabs)?;
        let tab = tabs
            .get(&id)
            .ok_or_else(|| Error::TabNotFound(id.to_string()))?;
        Ok((tab.navlog.can_go_back(), tab.navlog.can_go_forward()))
    }

    fn tab(&self, id: TabId) -> Result<Tab> {
        let tabs = lock(&self.inner.tabs)?;
        tabs.get(&id)
            .cloned()
            .ok_or_else(|| Error::TabNotFound(id.to_string()))
    }

    // ------------------------------------------------------------------
    // Layout
    // ------------------------------------------------------------------

    pub fn set_layout(&self, layout: Layout) -> Layout {
        let sanitized = layout.sanitize();
        if let Ok(mut current) = lock(&self.inner.layout) {
            *current = sanitized;
        }
        sanitized
    }

    /// Re-asserts tab bounds from the current window size and chrome layout.
    /// Also re-asserted after every activation (mitigation for the Linux
    /// Wayland child-webview bounds bug, tauri#15656).
    pub fn apply_layout(&self, app: &AppHandle) -> Result<()> {
        let (w, h) = Self::window_logical_size(app)?;
        let layout = self.layout();
        let top = layout.top;
        let (x, y, tab_w, tab_h) = layout.tab_rect(w, h);
        let scale = app
            .get_window(MAIN_WEBVIEW_LABEL)
            .and_then(|win| win.scale_factor().ok())
            .unwrap_or(0.0);
        log::info!(
            "apply_layout: window_logical=({w:.1}x{h:.1}) scale={scale:.4} layout.top={top:.1} tab_rect=({x:.1},{y:.1} {tab_w:.1}x{tab_h:.1})"
        );

        let active = self.active_id();
        let overlay_open = *lock(&self.inner.chrome_overlay_open)?;
        let views = lock(&self.inner.tabs)?
            .values()
            .map(|tab| {
                (
                    tab.handle.clone(),
                    Some(tab.id) == active
                        && !tab.is_new_tab()
                        && tab.chrome_page.is_none()
                        && !overlay_open,
                )
            })
            .collect::<Vec<_>>();
        for (handle, visible) in views {
            handle.set_bounds(x, y, tab_w, tab_h)?;
            handle.set_visible(visible)?;
        }
        Ok(())
    }

    fn window_logical_size(app: &AppHandle) -> Result<(f64, f64)> {
        let window = app
            .get_window(MAIN_WEBVIEW_LABEL)
            .ok_or_else(|| Error::WindowNotFound(MAIN_WEBVIEW_LABEL.to_string()))?;
        let size = window.inner_size()?;
        let scale = window.scale_factor()?;
        log::info!(
            "window_logical_size: physical=({}x{}) scale={}",
            size.width,
            size.height,
            scale
        );
        Ok((size.width as f64 / scale, size.height as f64 / scale))
    }

    // ------------------------------------------------------------------
    // Session & recently closed
    // ------------------------------------------------------------------

    /// Wires the debounced session-save trigger (called once from setup).
    pub fn enable_session_saves(&self, tx: UnboundedSender<()>) {
        if let Ok(mut signal) = lock(&self.inner.session_signal) {
            *signal = Some(tx);
        }
    }

    /// Requests a (debounced) session save. Called after every structural
    /// change; the saver task coalesces bursts.
    fn schedule_session_save(&self) {
        if let Ok(signal) = lock(&self.inner.session_signal)
            && let Some(tx) = signal.as_ref()
        {
            let _ = tx.send(());
        }
    }

    /// Serializable session state. Fresh tabs (never navigated) are omitted —
    /// they restore as a plain new tab.
    pub fn session_file(&self) -> SessionFile {
        let Ok(tabs) = lock(&self.inner.tabs) else {
            return SessionFile::empty();
        };
        let Ok(order) = lock(&self.inner.order) else {
            return SessionFile::empty();
        };
        let Ok(active) = lock(&self.inner.active) else {
            return SessionFile::empty();
        };
        let Ok(recently_closed) = lock(&self.inner.recently_closed) else {
            return SessionFile::empty();
        };

        let mut saved = Vec::new();
        let mut active_pos = 0usize;
        for id in order.iter() {
            let Some(tab) = tabs.get(id) else { continue };
            if tab.is_new_tab() {
                continue;
            }
            if Some(*id) == *active {
                active_pos = saved.len();
            }
            saved.push(SessionTab {
                url: tab.url.clone().unwrap_or_default(),
                title: tab.title.clone(),
                zoom: tab.zoom,
                pinned: tab.pinned,
                muted: tab.muted,
                navlog: tab.navlog.clone(),
            });
        }

        SessionFile {
            version: crate::session::SESSION_VERSION,
            windows: vec![SessionWindow {
                active_tab: active_pos,
                tabs: saved,
            }],
            recently_closed: recently_closed.iter().cloned().collect(),
        }
    }

    /// Restores saved tabs (new webviews, navigated to their last URL) and
    /// the recently-closed queue. Tab ids are reassigned in display order.
    pub fn restore_session(&self, app: &AppHandle, file: &SessionFile) -> Result<()> {
        let mut active_id: Option<TabId> = None;
        let mut first_id: Option<TabId> = None;
        if let Some(window) = file.windows.first() {
            for (i, saved) in window.tabs.iter().enumerate() {
                let info = self.create(app)?;
                if let Err(e) = self.navigate(app, info.id, &saved.url) {
                    log::warn!("restored tab {} failed to navigate: {e}", info.id);
                    continue;
                }
                first_id.get_or_insert(info.id);
                {
                    let mut tabs = lock(&self.inner.tabs)?;
                    let tab = tabs
                        .get_mut(&info.id)
                        .ok_or_else(|| Error::TabNotFound(info.id.to_string()))?;
                    tab.title = saved.title.clone();
                    tab.pinned = saved.pinned;
                    tab.navlog = saved.navlog.clone();
                }
                if (saved.zoom - 1.0).abs() > f64::EPSILON {
                    let _ = self.set_zoom(app, info.id, saved.zoom);
                }
                if saved.muted {
                    let _ = self.set_muted(app, info.id, true);
                }
                if i == window.active_tab {
                    active_id = Some(info.id);
                }
            }
        }
        if let Some(id) = active_id.or(first_id) {
            self.activate(app, id)?;
        }
        if let Ok(mut queue) = lock(&self.inner.recently_closed) {
            *queue = file
                .recently_closed
                .iter()
                .take(RECENTLY_CLOSED_CAP)
                .cloned()
                .collect();
        }
        Ok(())
    }

    pub fn recently_closed_list(&self) -> Vec<ClosedTab> {
        lock(&self.inner.recently_closed)
            .map(|queue| queue.iter().cloned().collect())
            .unwrap_or_default()
    }

    /// Reopens the most recently closed tab (Chrome's Ctrl+Shift+T).
    pub fn reopen_closed(&self, app: &AppHandle) -> Result<Option<TabInfo>> {
        let closed = lock(&self.inner.recently_closed)?.pop_front();
        let Some(closed) = closed else {
            return Ok(None);
        };
        let info = if closed.url == ABOUT_BLANK {
            self.create(app)?
        } else {
            self.create_with_url(app, &closed.url)?
        };
        self.activate(app, info.id)?;
        Ok(Some(info))
    }

    /// Shows or dismisses a chrome-local page on the active tab.
    pub fn set_chrome_page(&self, app: &AppHandle, page: Option<ChromePage>) -> Result<()> {
        let id = self
            .active_id()
            .ok_or_else(|| Error::Other("no active tab".into()))?;
        let overlay_open = *lock(&self.inner.chrome_overlay_open)?;
        let show_webview = {
            let mut tabs = lock(&self.inner.tabs)?;
            let tab = tabs
                .get_mut(&id)
                .ok_or_else(|| Error::TabNotFound(id.to_string()))?;
            tab.chrome_page = page;
            page.is_none() && !tab.is_new_tab() && !overlay_open
        };
        self.with_handle(id, |handle| handle.set_visible(show_webview))?;
        self.emit_snapshot(app)
    }

    pub fn set_chrome_overlay_open(&self, open: bool) -> Result<()> {
        *lock(&self.inner.chrome_overlay_open)? = open;
        let Some(id) = self.active_id() else {
            return Ok(());
        };
        let (handle, visible) = {
            let tabs = lock(&self.inner.tabs)?;
            let tab = tabs
                .get(&id)
                .ok_or_else(|| Error::TabNotFound(id.to_string()))?;
            (
                tab.handle.clone(),
                !open && !tab.is_new_tab() && tab.chrome_page.is_none(),
            )
        };
        handle.set_visible(visible)
    }

    /// Arms the one-shot download-prompt bypass on a tab.
    pub fn allow_next_download(&self, id: TabId, download_id: i64, url: &str) -> Result<()> {
        let mut tabs = lock(&self.inner.tabs)?;
        let tab = tabs
            .get_mut(&id)
            .ok_or_else(|| Error::TabNotFound(id.to_string()))?;
        tab.allow_next_download(download_id, url);
        Ok(())
    }

    /// Consumes the one-shot download-prompt bypass for `url`.
    pub fn take_pending_download(&self, id: TabId, url: &str) -> Option<i64> {
        let Ok(mut tabs) = lock(&self.inner.tabs) else {
            return None;
        };
        let tab = tabs.get_mut(&id)?;
        tab.take_pending_download(url)
    }

    /// Updates canonical favicon state before the event reaches chrome.
    pub fn set_favicon(&self, app: &AppHandle, id: TabId, favicon_url: Option<String>) {
        let result: Result<()> = (|| {
            let mut tabs = lock(&self.inner.tabs)?;
            let tab = tabs
                .get_mut(&id)
                .ok_or_else(|| Error::TabNotFound(id.to_string()))?;
            tab.favicon_url = favicon_url.clone();
            Ok(())
        })();
        if result.is_err() {
            return;
        }
        let _ = events::emit_to_chrome(
            app,
            events::EV_FAVICON_CHANGED,
            crate::favicons::FaviconChangedPayload { id, favicon_url },
        );
    }

    /// Current URL of a tab (best-effort; empty for fresh tabs).
    /// Used by the Linux permission hook; WebKitGTK does not expose the
    /// requesting origin itself.
    #[cfg(target_os = "linux")]
    pub fn tab_url(&self, id: TabId) -> Option<String> {
        let Ok(tabs) = lock(&self.inner.tabs) else {
            return None;
        };
        tabs.get(&id).and_then(|t| t.url.clone())
    }

    /// Runs `f` with the live handle of a tab.
    pub fn with_handle<T>(
        &self,
        id: TabId,
        f: impl FnOnce(&dyn WebviewHandle) -> Result<T>,
    ) -> Result<T> {
        let handle = lock(&self.inner.tabs)?
            .get(&id)
            .map(|tab| tab.handle.clone())
            .ok_or_else(|| Error::TabNotFound(id.to_string()))?;
        f(handle.as_ref())
    }

    /// Toggles engine-level muting and emits the updated snapshot.
    pub fn set_muted(&self, app: &AppHandle, id: TabId, muted: bool) -> Result<()> {
        self.tab(id)?.handle.set_muted(muted)?;
        {
            let mut tabs = lock(&self.inner.tabs)?;
            let tab = tabs
                .get_mut(&id)
                .ok_or_else(|| Error::TabNotFound(id.to_string()))?;
            tab.muted = muted;
        }
        self.emit_snapshot(app)
    }

    /// Unloads a background tab, keeping its URL so activation restores it.
    /// Silently skips fresh, discarded, or active tabs.
    pub fn discard(&self, app: &AppHandle, id: TabId) -> Result<()> {
        let can_discard = {
            let tabs = lock(&self.inner.tabs)?;
            match tabs.get(&id) {
                Some(tab) if !tab.discarded && !tab.is_new_tab() => self.active_id() != Some(id),
                _ => false,
            }
        };
        if !can_discard {
            return Ok(());
        }
        self.tab(id)?.handle.navigate(ABOUT_BLANK)?;
        let mut tabs = lock(&self.inner.tabs)?;
        let tab = tabs
            .get_mut(&id)
            .ok_or_else(|| Error::TabNotFound(id.to_string()))?;
        tab.discarded = true;
        drop(tabs);
        self.emit_snapshot(app)
    }

    /// Hides inactive tabs that have not been used for
    /// `tab_sleep_after_minutes` (0 disables the sweep). Sleeping hides the
    /// webview only — the page keeps running and wakes with no reload.
    pub fn sweep_sleeping(&self, app: &AppHandle) {
        let Some(state) = app.try_state::<crate::state::AppState>() else {
            return;
        };
        let minutes = lock(&state.settings)
            .map(|s| s.tab_sleep_after_minutes)
            .unwrap_or(0);
        if minutes == 0 {
            return;
        }
        let threshold = repos::bookmarks::now_epoch() - i64::from(minutes) * 60;
        let active = self.active_id();
        let mut changed = false;
        {
            let Ok(mut tabs) = lock(&self.inner.tabs) else {
                return;
            };
            for (tid, tab) in tabs.iter_mut() {
                if Some(*tid) == active {
                    continue;
                }
                if tab.pinned || tab.sleeping || tab.discarded || tab.is_new_tab() {
                    continue;
                }
                // No audio detection on WebView2 yet; tabs that report audio
                // are never swept.
                if tab.audio {
                    continue;
                }
                let url = tab.url.as_deref().unwrap_or_default();
                if !(url.starts_with("http://") || url.starts_with("https://")) {
                    continue;
                }
                if tab.last_used_at >= threshold {
                    continue;
                }
                if tab.sleep().is_err() {
                    continue;
                }
                changed = true;
            }
        }
        if changed {
            let _ = self.emit_snapshot(app);
        }
    }

    // ------------------------------------------------------------------
    // Tab lifecycle
    // ------------------------------------------------------------------

    pub fn create(&self, app: &AppHandle) -> Result<TabInfo> {
        let id = self.inner.next_id.fetch_add(1, Ordering::Relaxed) + 1;
        let label = format!("{TAB_WEBVIEW_PREFIX}{id}");

        let window = app
            .get_window(MAIN_WEBVIEW_LABEL)
            .ok_or_else(|| Error::WindowNotFound(MAIN_WEBVIEW_LABEL.to_string()))?;

        let (w, h) = Self::window_logical_size(app)?;
        let (x, y, tab_w, tab_h) = self.layout().tab_rect(w, h);

        let app_handle = app.clone();
        let builder = WebviewBuilder::new(
            label.clone(),
            WebviewUrl::External(Url::parse(ABOUT_BLANK).map_err(|e| Error::Other(e.to_string()))?),
        )
        .focused(false)
        .devtools(cfg!(debug_assertions))
        .on_navigation(move |url| match nav_policy::validate(url) {
            Ok(()) => true,
            Err(e) => {
                log::warn!("blocked navigation to {url}: {e}");
                false
            }
        })
        .on_page_load({
            let app_handle = app_handle.clone();
            move |webview: tauri::Webview, payload: tauri::webview::PageLoadPayload| {
                let Some(id) = tab_id_from_label(webview.label()) else {
                    return;
                };
                let tabs = &app_handle.state::<crate::state::AppState>().tabs;
                match payload.event() {
                    PageLoadEvent::Started => tabs.on_load_started(&app_handle, id),
                    PageLoadEvent::Finished => {
                        let url = webview.url().map(|u| u.to_string()).unwrap_or_default();
                        tabs.on_load_finished(&app_handle, id, &url);
                        let favicons = app_handle
                            .state::<crate::state::AppState>()
                            .favicons
                            .clone();
                        favicons.handle_load(&app_handle, id, &url);
                    }
                }
            }
        })
        .on_document_title_changed({
            let app_handle = app_handle.clone();
            move |webview: tauri::Webview, title: String| {
                let Some(id) = tab_id_from_label(webview.label()) else {
                    return;
                };
                let tabs = &app_handle.state::<crate::state::AppState>().tabs;
                // Find-in-page match counts ride on document.title; never
                // surface the marker as a real title.
                if crate::find::handle_title_marker(&app_handle, id, &title) {
                    return;
                }
                tabs.set_title(&app_handle, id, &title);
            }
        })
        .on_new_window({
            let app_handle = app_handle.clone();
            move |url: Url, _features: tauri::webview::NewWindowFeatures| {
                // window.open() / target=_blank → new tab in the same window
                let tabs = &app_handle.state::<crate::state::AppState>().tabs;
                let url_str = url.to_string();
                let _ = tabs.create_with_url(&app_handle, &url_str);
                tauri::webview::NewWindowResponse::Deny
            }
        })
        .on_download({
            let app_handle = app_handle.clone();
            move |webview: tauri::Webview, payload: tauri::webview::DownloadEvent| {
                let Some(id) = tab_id_from_label(webview.label()) else {
                    return false;
                };
                let tabs = &app_handle.state::<crate::state::AppState>().tabs;
                match payload {
                    tauri::webview::DownloadEvent::Requested { url, destination } => {
                        let allow = crate::downloads::on_download_requested(
                            &app_handle,
                            tabs,
                            id,
                            url.as_str(),
                            destination,
                        );
                        if !allow {
                            log::info!("download blocked by ask-before-download: {url}");
                        }
                        allow
                    }
                    tauri::webview::DownloadEvent::Finished { url, path, success } => {
                        crate::downloads::on_download_finished(
                            &app_handle,
                            url.as_str(),
                            path.as_deref(),
                            success,
                        );
                        true
                    }
                    // Future variants (e.g. progress) never cancel a download.
                    _ => true,
                }
            }
        });

        let webview = window.add_child(
            builder,
            tauri::LogicalPosition::new(x, y),
            tauri::LogicalSize::new(tab_w, tab_h),
        )?;

        crate::permissions::install_webview_hooks(app, id, &webview)?;

        let handle: Arc<dyn WebviewHandle> = Arc::new(LiveWebview::new(webview));
        // Hidden until activated, so tab switches never flash.
        let _ = handle.set_visible(false);

        let default_zoom = app
            .try_state::<crate::state::AppState>()
            .and_then(|state| {
                lock(&state.settings)
                    .ok()
                    .map(|settings| settings.zoom_default)
            })
            .unwrap_or(1.0);
        if (default_zoom - 1.0).abs() > f64::EPSILON {
            handle.set_zoom(default_zoom)?;
        }
        let mut tab = Tab::new(id, handle);
        tab.zoom = default_zoom;
        let info = tab.to_info(false);
        {
            let mut tabs = lock(&self.inner.tabs)?;
            tabs.insert(id, tab);
        }
        lock(&self.inner.order)?.push(id);

        events::emit_to_chrome(app, events::EV_TAB_CREATED, info.clone())?;
        log::info!("created {label}");
        Ok(info)
    }

    /// Creates a tab and navigates it to `address` in one step.
    /// Used by `window.open` handling and (later) by restored sessions.
    pub fn create_with_url(&self, app: &AppHandle, address: &str) -> Result<TabInfo> {
        let info = self.create(app)?;
        let id = info.id;
        if let Err(error) = self.navigate(app, id, address) {
            let _ = self.close(app, id);
            return Err(error);
        }
        self.tab(id).map(|tab| tab.to_info(false))
    }

    pub fn activate(&self, app: &AppHandle, id: TabId) -> Result<()> {
        let (w, h) = Self::window_logical_size(app)?;
        let (x, y, tab_w, tab_h) = self.layout().tab_rect(w, h);

        let overlay_open = *lock(&self.inner.chrome_overlay_open)?;
        let (target, others, visible, restore) = {
            let tabs = lock(&self.inner.tabs)?;
            let tab = tabs
                .get(&id)
                .ok_or_else(|| Error::TabNotFound(id.to_string()))?;
            let restore = tab
                .discarded
                .then(|| tab.url.clone())
                .flatten()
                .filter(|url| url.starts_with("http://") || url.starts_with("https://"));
            (
                tab.handle.clone(),
                tabs.iter()
                    .filter(|(tab_id, _)| **tab_id != id)
                    .map(|(_, tab)| tab.handle.clone())
                    .collect::<Vec<_>>(),
                !tab.is_new_tab() && tab.chrome_page.is_none() && !overlay_open,
                restore,
            )
        };
        for handle in others {
            handle.set_visible(false)?;
        }
        target.set_visible(visible)?;
        if let Some(url) = restore.as_deref() {
            target.navigate(url)?;
        }
        target.set_bounds(x, y, tab_w, tab_h)?;
        target.set_focus()?;

        let mut tabs = lock(&self.inner.tabs)?;
        let tab = tabs
            .get_mut(&id)
            .ok_or_else(|| Error::TabNotFound(id.to_string()))?;
        tab.touch();
        tab.sleeping = false;
        if restore.is_some() {
            tab.discarded = false;
        }
        drop(tabs);

        *lock(&self.inner.active)? = Some(id);
        events::emit_to_chrome(app, events::EV_TAB_ACTIVATED, IdPayload { id })?;
        self.emit_snapshot(app)
    }

    pub fn close(&self, app: &AppHandle, id: TabId) -> Result<()> {
        let was_active = self.active_id() == Some(id);
        let (handle, closed) = {
            let mut tabs = lock(&self.inner.tabs)?;
            let tab = tabs
                .remove(&id)
                .ok_or_else(|| Error::TabNotFound(id.to_string()))?;
            (
                tab.handle.clone(),
                ClosedTab {
                    url: tab.url.clone().unwrap_or_default(),
                    title: tab.title.clone(),
                },
            )
        };
        let _ = handle.close();

        {
            let mut queue = lock(&self.inner.recently_closed)?;
            queue.push_front(closed);
            queue.truncate(RECENTLY_CLOSED_CAP);
        }

        let neighbor = self.remove_from_order(id)?;

        if was_active {
            if let Some(neighbor) = neighbor {
                self.activate(app, neighbor)?;
            } else {
                *lock(&self.inner.active)? = None;
            }
        }

        events::emit_to_chrome(app, events::EV_TAB_CLOSED, IdPayload { id })?;
        self.emit_snapshot(app)
    }

    pub fn close_others(&self, app: &AppHandle, keep_id: TabId) -> Result<()> {
        if self.tab(keep_id).is_err() {
            return Err(Error::TabNotFound(keep_id.to_string()));
        }
        let ids = lock(&self.inner.order)?
            .iter()
            .copied()
            .filter(|id| *id != keep_id)
            .collect::<Vec<_>>();
        for id in ids {
            self.close(app, id)?;
        }
        self.activate(app, keep_id)
    }

    pub fn close_right(&self, app: &AppHandle, id: TabId) -> Result<()> {
        let ids = {
            let order = lock(&self.inner.order)?;
            let position = order
                .iter()
                .position(|tab_id| *tab_id == id)
                .ok_or_else(|| Error::TabNotFound(id.to_string()))?;
            order.iter().skip(position + 1).copied().collect::<Vec<_>>()
        };
        for close_id in ids {
            self.close(app, close_id)?;
        }
        Ok(())
    }

    fn remove_from_order(&self, id: TabId) -> Result<Option<TabId>> {
        let mut order = lock(&self.inner.order)?;
        let Some(pos) = order.iter().position(|tab_id| *tab_id == id) else {
            return Ok(None);
        };
        let neighbor = order
            .get(pos + 1)
            .or_else(|| pos.checked_sub(1).and_then(|index| order.get(index)))
            .copied();
        order.remove(pos);
        Ok(neighbor)
    }

    // ------------------------------------------------------------------
    // Navigation
    // ------------------------------------------------------------------

    pub fn navigate(&self, app: &AppHandle, id: TabId, address: &str) -> Result<()> {
        let search_engine = app
            .try_state::<crate::state::AppState>()
            .and_then(|state| {
                lock(&state.settings)
                    .ok()
                    .map(|settings| settings.search_engine.clone())
            })
            .unwrap_or_else(|| crate::settings::Settings::default().search_engine);
        let url = Address::resolve(address, &search_engine)?;
        nav_policy::validate(&url).map_err(|e| Error::NavigationBlocked(e.to_string()))?;
        let url_str = url.to_string();

        let is_active = self.active_id() == Some(id);
        let handle = self.tab(id)?.handle;
        handle.navigate(&url_str)?;
        {
            let mut tabs = lock(&self.inner.tabs)?;
            let tab = tabs
                .get_mut(&id)
                .ok_or_else(|| Error::TabNotFound(id.to_string()))?;
            tab.navlog.push(url_str.clone(), None);
            tab.on_load_started();
            tab.touch();
            // Navigating dismisses any open chrome-local page.
            tab.chrome_page = None;
            // The tab is no longer a fresh about:blank, so its webview may
            // now paint over the chrome content area — but only when it is
            // the active tab (window.open tabs stay hidden until activated).
        }
        let overlay_open = *lock(&self.inner.chrome_overlay_open)?;
        if is_active && !overlay_open {
            handle.set_visible(true)?;
        }

        let (back, forward) = self.nav_state(id)?;
        events::emit_to_chrome(
            app,
            events::EV_URL_CHANGED,
            UrlChangedPayload { id, url: url_str },
        )?;
        events::emit_to_chrome(
            app,
            events::EV_LOADING_CHANGED,
            LoadingChangedPayload { id, loading: true },
        )?;
        events::emit_to_chrome(
            app,
            events::EV_NAV_STATE_CHANGED,
            NavStateChangedPayload {
                id,
                can_go_back: back,
                can_go_forward: forward,
            },
        )?;
        self.emit_snapshot(app)
    }

    /// Returns `false` when the tab is already at the oldest entry.
    pub fn go_back(&self, app: &AppHandle, id: TabId) -> Result<bool> {
        let tab = self.tab(id)?;
        if !tab.navlog.can_go_back() {
            return Ok(false);
        }
        tab.go_back()?;
        {
            let mut tabs = lock(&self.inner.tabs)?;
            if let Some(tab) = tabs.get_mut(&id) {
                tab.navlog.move_back();
            }
        }
        let (back, forward) = self.nav_state(id)?;
        events::emit_to_chrome(
            app,
            events::EV_NAV_STATE_CHANGED,
            NavStateChangedPayload {
                id,
                can_go_back: back,
                can_go_forward: forward,
            },
        )?;
        Ok(true)
    }

    pub fn go_forward(&self, app: &AppHandle, id: TabId) -> Result<bool> {
        let tab = self.tab(id)?;
        if !tab.navlog.can_go_forward() {
            return Ok(false);
        }
        tab.go_forward()?;
        {
            let mut tabs = lock(&self.inner.tabs)?;
            if let Some(tab) = tabs.get_mut(&id) {
                tab.navlog.move_forward();
            }
        }
        let (back, forward) = self.nav_state(id)?;
        events::emit_to_chrome(
            app,
            events::EV_NAV_STATE_CHANGED,
            NavStateChangedPayload {
                id,
                can_go_back: back,
                can_go_forward: forward,
            },
        )?;
        Ok(true)
    }

    pub fn reload(&self, app: &AppHandle, id: TabId) -> Result<()> {
        let tab = self.tab(id)?;
        tab.reload()?;
        {
            let mut tabs = lock(&self.inner.tabs)?;
            if let Some(tab) = tabs.get_mut(&id) {
                tab.on_load_started();
            }
        }
        events::emit_to_chrome(
            app,
            events::EV_LOADING_CHANGED,
            LoadingChangedPayload { id, loading: true },
        )?;
        self.emit_snapshot(app)
    }

    pub fn hard_reload(&self, _app: &AppHandle, id: TabId) -> Result<()> {
        let tab = self.tab(id)?;
        tab.hard_reload()
    }

    pub fn stop(&self, app: &AppHandle, id: TabId) -> Result<()> {
        let tab = self.tab(id)?;
        tab.stop()?;
        {
            let mut tabs = lock(&self.inner.tabs)?;
            if let Some(tab) = tabs.get_mut(&id) {
                tab.on_stopped();
            }
        }
        events::emit_to_chrome(
            app,
            events::EV_LOADING_CHANGED,
            LoadingChangedPayload { id, loading: false },
        )?;
        self.emit_snapshot(app)
    }

    pub fn set_zoom(&self, app: &AppHandle, id: TabId, factor: f64) -> Result<f64> {
        let actual = if factor.is_finite() {
            factor.clamp(0.25, 5.0)
        } else {
            1.0
        };
        self.tab(id)?.handle.set_zoom(actual)?;
        {
            let mut tabs = lock(&self.inner.tabs)?;
            let tab = tabs
                .get_mut(&id)
                .ok_or_else(|| Error::TabNotFound(id.to_string()))?;
            tab.zoom = actual;
        }
        events::emit_to_chrome(
            app,
            events::EV_ZOOM_CHANGED,
            ZoomChangedPayload { id, zoom: actual },
        )?;
        self.emit_snapshot(app)?;
        Ok(actual)
    }

    pub fn zoom_in(&self, app: &AppHandle, id: TabId) -> Result<f64> {
        let current = self.tab(id)?.zoom;
        self.set_zoom(app, id, current + 0.1)
    }

    pub fn zoom_out(&self, app: &AppHandle, id: TabId) -> Result<f64> {
        let current = self.tab(id)?.zoom;
        self.set_zoom(app, id, current - 0.1)
    }

    pub fn zoom_reset(&self, app: &AppHandle, id: TabId) -> Result<f64> {
        self.set_zoom(app, id, 1.0)
    }

    // ------------------------------------------------------------------
    // Engine event hooks (called from webview callbacks)
    // ------------------------------------------------------------------

    pub fn on_load_started(&self, app: &AppHandle, id: TabId) {
        crate::find::on_navigation(app, id);
        let result: Result<()> = (|| {
            let mut tabs = lock(&self.inner.tabs)?;
            let tab = tabs
                .get_mut(&id)
                .ok_or_else(|| Error::TabNotFound(id.to_string()))?;
            tab.on_load_started();
            Ok(())
        })();
        if result.is_ok() {
            let _ = events::emit_to_chrome(
                app,
                events::EV_LOADING_CHANGED,
                LoadingChangedPayload { id, loading: true },
            );
        }
    }

    pub fn on_load_finished(&self, app: &AppHandle, id: TabId, url: &str) {
        let (loaded, title) = {
            let result: Result<(String, String)> = (|| {
                let mut tabs = lock(&self.inner.tabs)?;
                let tab = tabs
                    .get_mut(&id)
                    .ok_or_else(|| Error::TabNotFound(id.to_string()))?;
                let title = tab.title.clone();
                tab.on_loaded(url);
                tab.touch();
                if let Err(e) = tab.reapply_mute() {
                    log::warn!("reapplying mute after load failed: {e}");
                }
                Ok((url.to_string(), title))
            })();
            match result {
                Ok(pair) => pair,
                Err(_) => return,
            }
        };
        let _ = events::emit_to_chrome(
            app,
            events::EV_URL_CHANGED,
            UrlChangedPayload {
                id,
                url: loaded.clone(),
            },
        );
        let _ = events::emit_to_chrome(
            app,
            events::EV_LOADING_CHANGED,
            LoadingChangedPayload { id, loading: false },
        );
        let _ = events::emit_to_chrome(
            app,
            events::EV_NAV_STATE_CHANGED,
            NavStateChangedPayload {
                id,
                can_go_back: self.nav_state(id).map(|(b, _)| b).unwrap_or(false),
                can_go_forward: self.nav_state(id).map(|(_, f)| f).unwrap_or(false),
            },
        );
        let _ = self.emit_snapshot(app);
        Self::record_history(app, &loaded, &title);
    }

    /// Fire-and-forget history insert for http(s) page loads.
    fn record_history(app: &AppHandle, url: &str, title: &str) {
        if !(url.starts_with("http://") || url.starts_with("https://")) {
            return;
        }
        let Some(state) = app.try_state::<crate::state::AppState>() else {
            return;
        };
        let db = state.db.clone();
        let url = url.to_string();
        let title = title.to_string();
        tauri::async_runtime::spawn_blocking(move || {
            let result = db.with_conn(|conn| {
                repos::history::record(conn, &url, Some(&title), repos::history::now_epoch())
            });
            if let Err(e) = result {
                log::error!("history record failed: {e}");
            }
        });
    }

    pub fn set_title(&self, app: &AppHandle, id: TabId, title: &str) {
        let result: Result<()> = (|| {
            let mut tabs = lock(&self.inner.tabs)?;
            let tab = tabs
                .get_mut(&id)
                .ok_or_else(|| Error::TabNotFound(id.to_string()))?;
            tab.set_title(title);
            Ok(())
        })();
        if result.is_ok() {
            let _ = events::emit_to_chrome(
                app,
                events::EV_TITLE_CHANGED,
                TitleChangedPayload {
                    id,
                    title: title.to_string(),
                },
            );
            Self::record_history_title(app, id, title);
        }
    }

    /// Keeps the most recent history row's title in sync with the page title
    /// (title events can arrive after the load finished).
    fn record_history_title(app: &AppHandle, id: TabId, title: &str) {
        let Some(state) = app.try_state::<crate::state::AppState>() else {
            return;
        };
        let db = state.db.clone();
        let url = lock(&state.tabs.inner.tabs)
            .ok()
            .and_then(|tabs| tabs.get(&id).and_then(|tab| tab.url.clone()));
        let Some(url) = url.filter(|u| u.starts_with("http://") || u.starts_with("https://"))
        else {
            return;
        };
        let title = title.to_string();
        tauri::async_runtime::spawn_blocking(move || {
            if let Err(e) =
                db.with_conn(|conn| repos::history::update_latest_title(conn, &url, &title))
            {
                log::error!("history title update failed: {e}");
            }
        });
    }

    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------

    pub fn emit_snapshot(&self, app: &AppHandle) -> Result<()> {
        self.schedule_session_save();
        events::emit_to_chrome(app, events::EV_TABS_SNAPSHOT, self.snapshot())
    }
}

/// Parses `tab-<id>` labels back into tab ids.
pub fn tab_id_from_label(label: &str) -> Option<TabId> {
    label
        .strip_prefix(TAB_WEBVIEW_PREFIX)
        .and_then(|rest| rest.parse::<TabId>().ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_tab_labels() {
        assert_eq!(tab_id_from_label("tab-1"), Some(1));
        assert_eq!(tab_id_from_label("tab-42"), Some(42));
        assert_eq!(tab_id_from_label("main"), None);
        assert_eq!(tab_id_from_label("tab-"), None);
        assert_eq!(tab_id_from_label("tab-x"), None);
        assert_eq!(tab_id_from_label("tab-01"), Some(1));
    }

    #[test]
    fn snapshot_follows_display_order() {
        let manager = TabManager::new();
        {
            let mut tabs = manager.inner.tabs.lock().unwrap();
            let mut order = manager.inner.order.lock().unwrap();
            for id in [1u64, 2, 3] {
                tabs.insert(
                    id,
                    Tab::new(id, crate::webview::mock::MockWebviewHandle::bind()),
                );
                order.push(id);
            }
        }
        *manager.inner.active.lock().unwrap() = Some(2);

        let snap = manager.snapshot();
        let window = &snap.windows[0];
        assert_eq!(window.id, MAIN_WINDOW_ID);
        assert_eq!(window.active_tab_id, Some(2));
        let ids: Vec<u64> = window.tabs.iter().map(|t| t.id).collect();
        assert_eq!(ids, vec![1, 2, 3]);
        assert_eq!(
            window.tabs.iter().map(|t| t.is_active).collect::<Vec<_>>(),
            vec![false, true, false]
        );
    }

    #[test]
    fn snapshot_reorders_when_order_changes() {
        let manager = TabManager::new();
        {
            let mut tabs = manager.inner.tabs.lock().unwrap();
            let mut order = manager.inner.order.lock().unwrap();
            for id in [1u64, 2, 3] {
                tabs.insert(
                    id,
                    Tab::new(id, crate::webview::mock::MockWebviewHandle::bind()),
                );
                order.push(id);
            }
            order.swap(0, 2);
        }
        let ids: Vec<u64> = manager.snapshot().windows[0]
            .tabs
            .iter()
            .map(|t| t.id)
            .collect();
        assert_eq!(ids, vec![3, 2, 1]);
    }

    #[test]
    fn remove_from_order_prefers_right_then_left() {
        let manager = TabManager::new();
        *manager.inner.order.lock().unwrap() = vec![1, 2, 3];
        assert_eq!(manager.remove_from_order(2).unwrap(), Some(3));
        assert_eq!(manager.remove_from_order(3).unwrap(), Some(1));
        assert_eq!(manager.remove_from_order(1).unwrap(), None);
        assert_eq!(manager.remove_from_order(99).unwrap(), None);
    }

    #[test]
    fn removing_active_order_entry_preserves_its_neighbor() {
        let manager = TabManager::new();
        *manager.inner.order.lock().unwrap() = vec![1, 2, 3];
        assert_eq!(manager.remove_from_order(2).unwrap(), Some(3));
        assert_eq!(*manager.inner.order.lock().unwrap(), vec![1, 3]);
    }

    #[test]
    fn empty_snapshot_has_one_window_with_no_tabs() {
        let manager = TabManager::new();
        let snap = manager.snapshot();
        assert_eq!(snap.windows.len(), 1);
        assert!(snap.windows[0].tabs.is_empty());
        assert_eq!(snap.windows[0].active_tab_id, None);
    }

    #[test]
    fn sleep_then_wake_roundtrip() {
        use crate::webview::mock::MockWebviewHandle;

        let handle = MockWebviewHandle::new();
        let mut tab = Tab::new(1, Arc::new(handle.clone()));
        tab.sleep().unwrap();
        assert!(tab.sleeping);
        assert_eq!(handle.visibility(), vec![false]);
        tab.wake().unwrap();
        assert!(!tab.sleeping);
        assert_eq!(handle.visibility(), vec![false, true]);
    }

    #[test]
    fn discard_restores_url_on_wake_navigation() {
        use crate::webview::mock::MockWebviewHandle;

        let handle = MockWebviewHandle::new();
        let mut tab = Tab::new(1, Arc::new(handle.clone()));
        let url = Url::parse("https://example.com/").unwrap();
        tab.navigate(url).unwrap();
        tab.on_loaded("https://example.com/");
        tab.discard().unwrap();
        assert!(tab.discarded);
        assert_eq!(
            handle.navigations().last().map(String::as_str),
            Some("about:blank")
        );
        // Loading the discarded about:blank page must not clobber the URL.
        tab.on_loaded("about:blank");
        assert_eq!(tab.url.as_deref(), Some("https://example.com/"));
    }

    #[test]
    fn mute_applies_engine_call_and_reapply_is_idempotent() {
        use crate::webview::mock::MockWebviewHandle;

        let handle = MockWebviewHandle::new();
        let mut tab = Tab::new(1, Arc::new(handle.clone()));
        tab.set_muted(true).unwrap();
        assert!(tab.muted);
        tab.reapply_mute().unwrap();
        assert_eq!(handle.calls.mutes.lock().unwrap().as_slice(), &[true, true]);
    }

    #[test]
    fn muted_tab_reports_no_audio() {
        let mut tab = Tab::new(1, crate::webview::mock::MockWebviewHandle::bind());
        tab.audio = true;
        assert!(tab.to_info(false).audio);
        tab.set_muted(true).unwrap();
        assert!(!tab.to_info(false).audio);
    }
}
