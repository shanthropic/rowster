pub mod migrations;

use std::path::Path;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use rusqlite::Connection;

use crate::error::{Error, Result};

pub const DB_FILE_NAME: &str = "rowster.db";

/// Shared handle to the single SQLite connection.
///
/// Rowster uses one connection (WAL mode) guarded by a mutex; every
/// repository function is a pure `fn(&Connection) -> Result<_>`. Long-lived
/// commands run DB work on `tauri::async_runtime::spawn_blocking` to keep the UI
/// thread responsive.
#[derive(Clone)]
pub struct Db {
    conn: Arc<Mutex<Connection>>,
}

impl Db {
    /// Opens (or creates) the database at `dir/rowster.db`.
    ///
    /// On open failure the file is renamed aside and a fresh database is
    /// created, so a corrupt file never bricks the browser.
    pub fn open(dir: &Path) -> Result<Self> {
        let path = dir.join(DB_FILE_NAME);
        match Self::open_at(&path) {
            Ok(db) => Ok(db),
            Err(first) => {
                log::error!("opening database failed ({first}); moving aside and recreating");
                let stamp = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                let aside = dir.join(format!("rowster-corrupt-{stamp}.db"));
                if path.exists() {
                    std::fs::rename(&path, &aside)?;
                } else {
                    return Err(first);
                }
                Self::open_at(&path)
            }
        }
    }

    /// Test helper; an in-memory database with migrations applied.
    pub fn open_in_memory() -> Result<Self> {
        Self::open_at(":memory:".as_ref())
    }

    fn open_at(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        // WAL gives readers/writers better concurrency and crash safety.
        let _ = conn.pragma_update(None, "journal_mode", "WAL");
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.busy_timeout(Duration::from_secs(5))?;
        migrations::run(&conn)?;
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    /// Runs `f` on the single connection. Callers must not hold the guard
    /// across `.await` points (there is none — it returns before awaiting).
    pub fn with_conn<T>(&self, f: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
        let conn = self.conn()?;
        f(&conn)
    }

    pub fn conn(&self) -> Result<MutexGuard<'_, Connection>> {
        self.conn.lock().map_err(|_| Error::StatePoisoned)
    }
}

impl Default for Db {
    fn default() -> Self {
        // `AppState::default()` (used before `setup` wires the real path)
        // gets an in-memory database; opening one cannot fail in practice.
        Self::open_in_memory().expect("in-memory database open is infallible")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn in_memory_db_has_latest_schema() {
        let db = Db::open_in_memory().unwrap();
        let version: i64 = db
            .with_conn(|conn| {
                conn.query_row("PRAGMA user_version", [], |r| r.get(0))
                    .map_err(Into::into)
            })
            .unwrap();
        assert_eq!(version, migrations::MIGRATIONS.len() as i64);
    }

    #[test]
    fn schema_supports_history_writes() {
        let db = Db::open_in_memory().unwrap();
        let changed = db
            .with_conn(|conn| {
                conn.execute(
                    "INSERT INTO history (url, title, visit_time, domain)
                     VALUES (?1, ?2, ?3, ?4)",
                    [
                        "https://example.com/",
                        "Example",
                        "1700000000",
                        "example.com",
                    ],
                )
                .map_err(Into::into)
            })
            .unwrap();
        assert_eq!(changed, 1);
    }

    #[test]
    fn foreign_keys_are_enforced() {
        let db = Db::open_in_memory().unwrap();
        let result = db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO bookmarks (parent_id, title, url, position, created_at)
                 VALUES (999, 'orphan', NULL, 0, 0)",
                [],
            )
            .map_err(Into::into)
        });
        assert!(result.is_err());
    }
}
