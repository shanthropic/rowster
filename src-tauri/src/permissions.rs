use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::error::Result;
use crate::events;
use crate::model::TabId;
use crate::repos;
use crate::repos::permissions::{PermissionDecision, PermissionKind};
use crate::state::AppState;

/// How long an "allow once" decision is honoured before a re-prompt.
const ONCE_TTL: Duration = Duration::from_secs(120);

/// Outcome applied synchronously to the engine's permission request.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision {
    Allow,
    Deny,
}

/// Intermediate resolution before prompt emission.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Resolve {
    Allow,
    Deny,
    Prompt,
}

/// Payload for `EV_PERMISSION_REQUESTED` (chrome prompt).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionRequestedPayload {
    pub tab_id: TabId,
    pub origin: String,
    pub kind: PermissionKind,
}

/// In-memory record of "allow once" decisions, keyed by (origin, kind).
#[derive(Clone, Default)]
pub struct PermissionBroker {
    once: Arc<Mutex<HashMap<(String, PermissionKind), Instant>>>,
}

impl PermissionBroker {
    pub fn record_once(&self, origin: &str, kind: PermissionKind) {
        if let Ok(mut map) = crate::error::lock(&self.once) {
            map.insert((origin.to_string(), kind), Instant::now());
        }
    }

    pub fn is_allowed_once(&self, origin: &str, kind: PermissionKind) -> bool {
        let Ok(mut map) = crate::error::lock(&self.once) else {
            return false;
        };
        let now = Instant::now();
        map.retain(|_, at| now.duration_since(*at) < ONCE_TTL);
        map.contains_key(&(origin.to_string(), kind))
    }

    pub fn reset(&self, origin: &str, kind: PermissionKind) {
        if let Ok(mut map) = crate::error::lock(&self.once) {
            map.remove(&(origin.to_string(), kind));
        }
    }

    pub fn clear(&self) {
        if let Ok(mut map) = crate::error::lock(&self.once) {
            map.clear();
        }
    }
}

/// Synchronous decision for a single engine permission request.
///
/// Precedence: stored decision > active "allow once" > prompt + deny.
pub fn decide(app: &AppHandle, tab_id: TabId, origin: &str, kind: PermissionKind) -> Decision {
    let Some(state) = app.try_state::<AppState>() else {
        return Decision::Deny;
    };
    let Some(origin) = canonical_origin(origin) else {
        return Decision::Deny;
    };
    let resolve = resolve(&state.db, &state.permissions, &origin, kind);
    match resolve {
        Resolve::Allow => Decision::Allow,
        Resolve::Deny => Decision::Deny,
        Resolve::Prompt => {
            let _ = events::emit_to_chrome(
                app,
                events::EV_PERMISSION_REQUESTED,
                PermissionRequestedPayload {
                    tab_id,
                    origin,
                    kind,
                },
            );
            Decision::Deny
        }
    }
}

/// Reduces a page URL to the permission boundary used for persistence.
pub fn canonical_origin(input: &str) -> Option<String> {
    let url = url::Url::parse(input).ok()?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return None;
    }
    Some(url.origin().ascii_serialization())
}

/// Shared resolution core (no `AppHandle` needed; prompt emission is the
/// caller's job).
fn resolve(
    db: &crate::db::Db,
    broker: &PermissionBroker,
    origin: &str,
    kind: PermissionKind,
) -> Resolve {
    let stored = db
        .with_conn(|conn| repos::permissions::get(conn, origin, kind))
        .ok()
        .flatten();
    match stored {
        Some(PermissionDecision::AlwaysAllow) => Resolve::Allow,
        Some(PermissionDecision::Block) | Some(PermissionDecision::AllowOnce) => Resolve::Deny,
        None => {
            if broker.is_allowed_once(origin, kind) {
                Resolve::Allow
            } else {
                Resolve::Prompt
            }
        }
    }
}

/// Hooks an engine's permission-request callbacks for the given tab webview.
///
/// - Windows: WebView2 `PermissionRequested` event.
/// - Linux: WebKitGTK `permission-request` signal.
/// - macOS: WKWebView denies permission requests without a delegate hook
///   (documented v1 limitation; decisions can still be pre-stored in
///   Settings → Permissions and take effect where the engine supports it).
pub fn install_webview_hooks(
    app: &AppHandle,
    tab_id: TabId,
    webview: &tauri::Webview,
) -> Result<()> {
    #[cfg(target_os = "windows")]
    install_windows(app, tab_id, webview)?;
    #[cfg(target_os = "linux")]
    install_linux(app, tab_id, webview)?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn install_windows(app: &AppHandle, tab_id: TabId, webview: &tauri::Webview) -> Result<()> {
    let app = app.clone();
    let _ = webview.with_webview(move |platform| {
        let core = match unsafe { platform.controller().CoreWebView2() } {
            Ok(core) => core,
            Err(e) => {
                log::error!("failed to get WebView2 core for tab {tab_id}: {e}");
                return;
            }
        };
        let handler = webview2_com::PermissionRequestedEventHandler::create(Box::new(
            move |_sender, args| {
                if let Some(args) = args
                    && let Err(e) = handle_webview2_permission(&app, tab_id, &args)
                {
                    log::error!("permission handler failed for tab {tab_id}: {e}");
                }
                Ok(())
            },
        ));
        let mut token = 0_i64;
        match unsafe { core.add_PermissionRequested(&handler, &mut token) } {
            Ok(()) => log::debug!("hooked WebView2 permission requests for tab {tab_id} ({token})"),
            Err(e) => log::error!("failed to hook WebView2 permissions for tab {tab_id}: {e}"),
        }
    });
    Ok(())
}

#[cfg(target_os = "windows")]
fn handle_webview2_permission(
    app: &AppHandle,
    tab_id: TabId,
    args: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2PermissionRequestedEventArgs,
) -> windows_core::Result<()> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_PERMISSION_KIND, COREWEBVIEW2_PERMISSION_KIND_CAMERA,
        COREWEBVIEW2_PERMISSION_KIND_GEOLOCATION, COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
        COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS, COREWEBVIEW2_PERMISSION_STATE_ALLOW,
        COREWEBVIEW2_PERMISSION_STATE_DENY,
    };
    use windows_core::PWSTR;

    let mut raw_kind = COREWEBVIEW2_PERMISSION_KIND(0);
    unsafe {
        args.PermissionKind(&mut raw_kind)?;
    }
    let kind = match raw_kind {
        COREWEBVIEW2_PERMISSION_KIND_CAMERA => PermissionKind::Camera,
        COREWEBVIEW2_PERMISSION_KIND_MICROPHONE => PermissionKind::Microphone,
        COREWEBVIEW2_PERMISSION_KIND_GEOLOCATION => PermissionKind::Geolocation,
        COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS => PermissionKind::Notifications,
        // Unhandled kinds keep WebView2's default behaviour.
        _ => return Ok(()),
    };

    let mut uri = PWSTR::null();
    unsafe {
        args.Uri(&mut uri)?;
    }
    let origin = if uri.is_null() {
        String::new()
    } else {
        unsafe { uri.to_string() }.unwrap_or_default()
    };

    match decide(app, tab_id, &origin, kind) {
        Decision::Allow => unsafe {
            args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
        },
        Decision::Deny => unsafe {
            args.SetState(COREWEBVIEW2_PERMISSION_STATE_DENY)?;
        },
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn install_linux(app: &AppHandle, tab_id: TabId, webview: &tauri::Webview) -> Result<()> {
    use webkit2gtk::prelude::WebViewExt;

    let state = app.state::<AppState>();
    let tabs = state.tabs.clone();
    let db = state.db.clone();
    let broker = state.permissions.clone();
    let app = app.clone();

    webview.with_webview(move |platform| {
        let view = platform.inner();
        view.connect_permission_request(Some(move |_view, request| {
            let name = request.permission_name();
            let kind = match name {
                "camera" => Some(PermissionKind::Camera),
                "microphone" => Some(PermissionKind::Microphone),
                "geolocation" => Some(PermissionKind::Geolocation),
                "notifications" => Some(PermissionKind::Notifications),
                _ => None,
            };
            let Some(kind) = kind else {
                return true;
            };
            // WebKitGTK does not expose the requesting origin; the tab's
            // current URL is the best approximation at request time.
            let origin = tabs
                .tab_url(tab_id)
                .and_then(|url| canonical_origin(&url))
                .unwrap_or_default();
            if origin.is_empty() {
                request.deny();
                return true;
            }
            match resolve(&db, &broker, &origin, kind) {
                Resolve::Allow => request.allow(),
                _ => {
                    let _ = events::emit_to_chrome(
                        app,
                        events::EV_PERMISSION_REQUESTED,
                        PermissionRequestedPayload {
                            tab_id,
                            origin,
                            kind,
                        },
                    );
                    request.deny();
                }
            }
            true
        }));
        log::debug!("hooked WebKitGTK permission requests for tab {tab_id}");
        Ok(())
    })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allow_once_expires() {
        let broker = PermissionBroker::default();
        broker.record_once("https://a.test", PermissionKind::Camera);
        assert!(broker.is_allowed_once("https://a.test", PermissionKind::Camera));
        assert!(!broker.is_allowed_once("https://b.test", PermissionKind::Camera));
        assert!(!broker.is_allowed_once("https://a.test", PermissionKind::Microphone));
        broker.clear();
        assert!(!broker.is_allowed_once("https://a.test", PermissionKind::Camera));
    }

    #[test]
    fn resolve_prefers_stored_over_once() {
        let db = crate::db::Db::open_in_memory().unwrap();
        let broker = PermissionBroker::default();
        broker.record_once("https://a.test", PermissionKind::Camera);
        db.with_conn(|conn| {
            repos::permissions::set(
                conn,
                "https://a.test",
                PermissionKind::Camera,
                PermissionDecision::Block,
            )
        })
        .unwrap();
        // A stored Block beats the active "allow once".
        assert_eq!(
            resolve(&db, &broker, "https://a.test", PermissionKind::Camera),
            Resolve::Deny
        );
        db.with_conn(|conn| {
            repos::permissions::set(
                conn,
                "https://a.test",
                PermissionKind::Camera,
                PermissionDecision::AlwaysAllow,
            )
        })
        .unwrap();
        assert_eq!(
            resolve(&db, &broker, "https://a.test", PermissionKind::Camera),
            Resolve::Allow
        );
    }

    #[test]
    fn resolve_prompts_when_unknown() {
        let db = crate::db::Db::open_in_memory().unwrap();
        let broker = PermissionBroker::default();
        assert_eq!(
            resolve(&db, &broker, "https://a.test", PermissionKind::Camera),
            Resolve::Prompt
        );
    }

    #[test]
    fn canonical_origin_drops_paths_queries_and_credentials() {
        assert_eq!(
            canonical_origin("https://user:secret@example.com:8443/path?q=1"),
            Some("https://example.com:8443".to_string())
        );
    }

    #[test]
    fn canonical_origin_rejects_non_web_origins() {
        assert_eq!(canonical_origin("file:///etc/passwd"), None);
        assert_eq!(canonical_origin("not a url"), None);
    }
}
