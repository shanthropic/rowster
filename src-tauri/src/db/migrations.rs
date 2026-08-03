use rusqlite::Connection;

use crate::error::Result;

/// Ordered schema migrations. Version `i + 1` is applied by the `i`-th entry.
/// Never edit an applied migration; append a new one.
pub const MIGRATIONS: &[&str] = &[
    // v1 — core browser tables (see docs/DATA_MODEL.md)
    r#"
    CREATE TABLE history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        title TEXT,
        visit_time INTEGER NOT NULL,
        domain TEXT
    );
    CREATE INDEX idx_history_visit ON history(visit_time);
    CREATE INDEX idx_history_domain_visit ON history(domain, visit_time);

    CREATE TABLE bookmarks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_id INTEGER REFERENCES bookmarks(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        url TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
    );

    CREATE TABLE downloads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tab_id INTEGER,
        url TEXT NOT NULL,
        filename TEXT NOT NULL,
        path TEXT,
        mime TEXT,
        total_bytes INTEGER,
        received_bytes INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        error TEXT,
        created_at INTEGER NOT NULL,
        finished_at INTEGER
    );

    CREATE TABLE site_permissions (
        origin TEXT NOT NULL,
        kind TEXT NOT NULL,
        decision TEXT NOT NULL,
        PRIMARY KEY (origin, kind)
    );

    CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    "#,
];

/// Applies pending migrations transactionally, tracking `PRAGMA user_version`.
pub fn run(conn: &Connection) -> Result<()> {
    let current: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    for (i, sql) in MIGRATIONS.iter().enumerate() {
        let version = (i + 1) as i64;
        if version <= current {
            continue;
        }
        log::info!("applying database migration v{version}");
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", version)?;
        tx.commit()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn fresh() -> Connection {
        Connection::open_in_memory().unwrap()
    }

    #[test]
    fn migrates_from_zero_to_latest() {
        let conn = fresh();
        run(&conn).unwrap();
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(version, MIGRATIONS.len() as i64);
    }

    #[test]
    fn rerunning_is_idempotent() {
        let conn = fresh();
        run(&conn).unwrap();
        run(&conn).unwrap();
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(version, MIGRATIONS.len() as i64);
    }

    #[test]
    fn partially_migrated_db_completes() {
        let conn = fresh();
        let first = MIGRATIONS[0];
        conn.execute_batch(first).unwrap();
        conn.pragma_update(None, "user_version", 1).unwrap();
        run(&conn).unwrap();
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(version, MIGRATIONS.len() as i64);
    }
}
