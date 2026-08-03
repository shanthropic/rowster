use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::error::Result;
use crate::events;
use crate::model::TabId;
use crate::state::AppState;

/// Find-in-page via `window.find` (Chromium/WebKit both implement it).
///
/// Match counting uses a document.title marker channel: `window.find`
/// cannot return values to `eval`, and tauri 2.11 has no JS→Rust bridge for
/// tab webviews, so the counting script stamps the count into
/// `document.title` and the `DocumentTitleChanged`/`notify::title` callback
/// routes it back here. The real title follows on the next event.
///
/// Limitations (documented in docs/PHASE_4.md): counting is best-effort on
/// pages that rewrite their own title concurrently; match *index* is not
/// tracked (no "3 of 12"); the session resets on navigation.
const MARKER_PREFIX: &str = "\u{e000}rowster-find:";

/// Cap to avoid runaway loops on pathological documents.
const MAX_MATCHES: u32 = 9_999;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct FindStatus {
    pub query: String,
    /// Number of matches; `None` until the counting pass reports back.
    pub match_count: Option<u32>,
    pub case_sensitive: bool,
}

#[derive(Debug, Clone)]
struct FindSession {
    query: String,
    match_count: Option<u32>,
    case_sensitive: bool,
}

#[derive(Clone, Default)]
pub struct FindBroker {
    sessions: Arc<Mutex<HashMap<TabId, FindSession>>>,
}

impl FindBroker {
    pub fn status(&self, id: TabId) -> Option<FindStatus> {
        let Ok(sessions) = crate::error::lock(&self.sessions) else {
            return None;
        };
        sessions.get(&id).map(|s| FindStatus {
            query: s.query.clone(),
            match_count: s.match_count,
            case_sensitive: s.case_sensitive,
        })
    }

    /// Ends a session (user closed the bar or the page navigated).
    fn clear(&self, app: &AppHandle, id: TabId) {
        let changed = crate::error::lock(&self.sessions)
            .map(|mut sessions| sessions.remove(&id).is_some())
            .unwrap_or(false);
        if changed {
            let _ = events::emit_to_chrome(
                app,
                events::EV_FIND_STATUS,
                FindStatusPayload {
                    tab_id: id,
                    status: None,
                },
            );
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FindStatusPayload {
    pub tab_id: TabId,
    pub status: Option<FindStatus>,
}

/// Emits the current (possibly updated) status for a tab.
fn emit_status(app: &AppHandle, id: TabId) {
    let state = app.state::<AppState>();
    let status = state.find.status(id);
    let _ = events::emit_to_chrome(
        app,
        events::EV_FIND_STATUS,
        FindStatusPayload { tab_id: id, status },
    );
}

/// Reacts to a `document.title` that carries a match-count marker.
pub fn handle_title_marker(app: &AppHandle, id: TabId, title: &str) -> bool {
    let Some(count) = title.strip_prefix(MARKER_PREFIX) else {
        return false;
    };
    let Some(state) = app.try_state::<AppState>() else {
        return true;
    };
    let count = if count == "na" {
        None
    } else {
        count.parse::<u32>().ok()
    };
    {
        let mut sessions = match crate::error::lock(&state.find.sessions) {
            Ok(g) => g,
            Err(_) => return true,
        };
        if let Some(session) = sessions.get_mut(&id) {
            session.match_count = count;
        }
    }
    emit_status(app, id);
    true
}

fn session_js(query: &str, case_sensitive: bool) -> String {
    let q = json_escape(query);
    format!(
        "(() => {{ if (typeof window.find !== 'function') return; \
         const q = {q}; const cs = {cs}; \
         let n = 0; while (window.find(q, cs, false, false) && n < {max}) {{ n++; }} \
         const sel = window.getSelection(); if (sel) sel.removeAllRanges(); \
         window.find(q, cs, false, false); \
         document.title = '{prefix}' + n; }})()",
        q = q,
        cs = case_sensitive,
        max = MAX_MATCHES,
        prefix = MARKER_PREFIX
    )
}

fn step_js(query: &str, case_sensitive: bool, backwards: bool) -> String {
    let q = json_escape(query);
    format!(
        "(() => {{ if (typeof window.find !== 'function') return; \
         window.find({q}, {cs}, {bw}, true); }})()",
        q = q,
        cs = case_sensitive,
        bw = backwards
    )
}

/// Escapes `query` for embedding in a double-quoted JS string.
fn json_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

fn eval(app: &AppHandle, id: TabId, js: &str) -> Result<()> {
    let tabs = app.state::<AppState>().tabs.clone();
    tabs.with_handle(id, |handle| handle.eval(js))
}

/// Opens (or replaces) a find session and jumps to the first match.
pub fn start(app: &AppHandle, id: TabId, query: &str, case_sensitive: bool) -> Result<FindStatus> {
    let query = query.trim().to_string();
    let broker = app.state::<AppState>().find.clone();
    {
        let mut sessions = crate::error::lock(&broker.sessions)?;
        if query.is_empty() {
            sessions.remove(&id);
            return Ok(FindStatus::default());
        }
        sessions.insert(
            id,
            FindSession {
                query: query.clone(),
                match_count: None,
                case_sensitive,
            },
        );
    }
    eval(app, id, &session_js(&query, case_sensitive))?;
    emit_status(app, id);
    Ok(app.state::<AppState>().find.status(id).unwrap_or_default())
}

/// Moves to the next / previous match (wraps).
pub fn step(app: &AppHandle, id: TabId, backwards: bool) -> Result<()> {
    let state = app.state::<AppState>();
    let Some(status) = state.find.status(id) else {
        return Ok(());
    };
    if status.query.is_empty() {
        return Ok(());
    }
    eval(
        app,
        id,
        &step_js(&status.query, status.case_sensitive, backwards),
    )
}

/// Closes the session and clears the in-page selection.
pub fn close(app: &AppHandle, id: TabId) -> Result<()> {
    let state = app.state::<AppState>();
    state.find.clear(app, id);
    eval(
        app,
        id,
        "(() => { const sel = window.getSelection(); if (sel) sel.removeAllRanges(); })()",
    )
}

/// Navigation invalidates every in-page match; forget the session.
pub fn on_navigation(app: &AppHandle, id: TabId) {
    let state = app.state::<AppState>();
    state.find.clear(app, id);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escaping_covers_quotes_and_controls() {
        assert_eq!(json_escape("a\"b"), "\"a\\\"b\"");
        assert_eq!(json_escape("a\\b"), "\"a\\\\b\"");
        assert_eq!(json_escape("a\nb"), "\"a\\nb\"");
        assert_eq!(json_escape("plain"), "\"plain\"");
    }

    #[test]
    fn marker_prefix_shape() {
        // The count script stamps `MARKER_PREFIX + n` into document.title;
        // handle_title_marker strips the prefix before parsing.
        assert!(MARKER_PREFIX.ends_with(':'));
        assert_eq!(
            MARKER_PREFIX.strip_prefix('\u{e000}'),
            Some("rowster-find:")
        );
    }

    #[test]
    fn session_js_embeds_query_safely() {
        let js = session_js("a\"b", true);
        assert!(js.contains("\"a\\\"b\""));
        assert!(js.contains("true"));
        let js = session_js("c\\d", false);
        assert!(js.contains("\"c\\\\d\""));
        assert!(js.contains("false"));
    }

    #[test]
    fn step_js_sets_direction() {
        assert!(step_js("x", false, true).contains("true, true"));
        assert!(step_js("x", false, false).contains("false, true"));
    }

    #[test]
    fn count_stamp_parses() {
        assert_eq!("3".parse::<u32>().ok(), Some(3));
        assert_eq!("na".parse::<u32>().ok(), None);
    }
}
