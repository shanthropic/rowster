use std::collections::HashSet;
use std::sync::Arc;

use crate::auth::AuthManager;
use crate::db::Db;
use crate::favicons::FaviconCache;
use crate::find::FindBroker;
use crate::permissions::PermissionBroker;
use crate::session::Session;
use crate::settings::Settings;
use crate::tabs::TabManager;

/// Global application state, managed via `tauri::Builder::manage`.
///
/// The default is safe for tests and pre-`setup` access: an in-memory
/// database, default settings, and a disabled session saver.
#[derive(Clone, Default)]
pub struct AppState {
    /// Authoritative authentication state. Protected commands must check this
    /// before touching tabs, settings, session state, or the database.
    pub auth: AuthManager,
    /// Prevents duplicate startup/session restoration after authentication.
    pub browser_started: Arc<std::sync::Mutex<bool>>,
    pub tabs: TabManager,
    pub db: Arc<Db>,
    /// Canonical settings, kept in memory and persisted through `repos`.
    pub settings: Arc<std::sync::Mutex<Settings>>,
    /// Serializes validated settings writes so concurrent patches cannot lose
    /// one another while SQLite work runs on a blocking thread.
    pub settings_write: Arc<tokio::sync::Mutex<()>>,
    pub session: Arc<Session>,
    /// In-memory "allow once" permission grants.
    pub permissions: Arc<PermissionBroker>,
    /// Find-in-page sessions per tab.
    pub find: Arc<FindBroker>,
    /// Favicon fetch/cache service (served via `favicon://`).
    pub favicons: Arc<FaviconCache>,
    /// Executable download ids that received a native confirmation prompt.
    pub pending_executable_open: Arc<std::sync::Mutex<HashSet<i64>>>,
}

impl AppState {
    /// Loads settings from the database, falling back to defaults.
    pub fn load_settings(&self) -> crate::error::Result<Settings> {
        let settings = self.db.with_conn(crate::repos::settings::load)?;
        if let Ok(mut guard) = crate::error::lock(&self.settings) {
            *guard = settings.clone();
        }
        Ok(settings)
    }
}
