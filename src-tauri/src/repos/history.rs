use rusqlite::Connection;
use serde::Serialize;
use url::Url;

use crate::error::Result;

#[derive(Debug, Clone, Serialize)]
pub struct HistoryEntry {
    pub id: i64,
    pub url: String,
    pub title: Option<String>,
    pub visit_time: i64,
    pub domain: Option<String>,
}

/// Records a visit (called on finished page loads; fire-and-forget).
pub fn record(conn: &Connection, url: &str, title: Option<&str>, visit_time: i64) -> Result<()> {
    let domain = Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(String::from));
    conn.execute(
        "INSERT INTO history (url, title, visit_time, domain) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![url, title, visit_time, domain],
    )?;
    Ok(())
}

/// Newest-first visits, optionally filtered by a LIKE needle.
pub fn query(conn: &Connection, needle: Option<&str>, limit: u64) -> Result<Vec<HistoryEntry>> {
    let limit = limit.clamp(1, 500) as i64;
    let needle = needle.map(|n| n.trim()).filter(|n| !n.is_empty());
    match needle {
        Some(needle) => {
            let like = format!("%{}%", needle.replace(['%', '_'], "\\$0"));
            let mut stmt = conn.prepare(
                "SELECT id, url, title, visit_time, domain FROM history
                 WHERE url LIKE ?1 ESCAPE '\\' OR title LIKE ?1 ESCAPE '\\'
                 ORDER BY visit_time DESC LIMIT ?2",
            )?;
            let rows = stmt.query_map(rusqlite::params![like, limit], map_entry)?;
            rows.collect::<std::result::Result<Vec<_>, _>>()
                .map_err(Into::into)
        }
        None => {
            let mut stmt = conn.prepare(
                "SELECT id, url, title, visit_time, domain FROM history
                 ORDER BY visit_time DESC LIMIT ?1",
            )?;
            let rows = stmt.query_map([limit], map_entry)?;
            rows.collect::<std::result::Result<Vec<_>, _>>()
                .map_err(Into::into)
        }
    }
}

fn map_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<HistoryEntry> {
    Ok(HistoryEntry {
        id: row.get(0)?,
        url: row.get(1)?,
        title: row.get(2)?,
        visit_time: row.get(3)?,
        domain: row.get(4)?,
    })
}

/// Most-visited domains (new-tab "Frequent" section), counting only visits
/// from the last 90 days so stale domains don't dominate the grid.
pub fn frequent(conn: &Connection, limit: u64) -> Result<Vec<HistoryEntry>> {
    let limit = limit.clamp(1, 100) as i64;
    let cutoff = now_epoch() - 90 * 86_400;
    let mut stmt = conn.prepare(
        "SELECT id, url, title, visit_time, domain FROM history
         WHERE domain IS NOT NULL AND visit_time >= ?1
         GROUP BY domain
         ORDER BY COUNT(*) DESC, MAX(visit_time) DESC LIMIT ?2",
    )?;
    let rows = stmt.query_map([cutoff, limit], |row| {
        Ok(HistoryEntry {
            id: row.get(0)?,
            url: row.get(1)?,
            title: row.get(2)?,
            visit_time: row.get(3)?,
            domain: row.get(4)?,
        })
    })?;
    rows.collect::<std::result::Result<Vec<_>, _>>()
        .map_err(Into::into)
}

/// Updates the title of the most recent row matching `url` (page titles
/// arrive asynchronously). Returns the number of rows updated.
pub fn update_latest_title(conn: &Connection, url: &str, title: &str) -> Result<u64> {
    let changed = conn.execute(
        "UPDATE history SET title = ?1
         WHERE id = (SELECT id FROM history WHERE url = ?2 ORDER BY id DESC LIMIT 1)",
        rusqlite::params![title, url],
    )?;
    Ok(changed as u64)
}

/// Deletes one entry; returns whether it existed.
pub fn delete(conn: &Connection, id: i64) -> Result<bool> {
    let changed = conn.execute("DELETE FROM history WHERE id = ?1", [id])?;
    Ok(changed > 0)
}

/// Deletes everything (or only visits before `before` when given).
/// Returns the number of removed rows.
pub fn clear(conn: &Connection, before: Option<i64>) -> Result<u64> {
    let changed = match before {
        Some(before) => conn.execute("DELETE FROM history WHERE visit_time < ?1", [before])?,
        None => conn.execute("DELETE FROM history", [])?,
    };
    Ok(changed as u64)
}

/// Retention cleanup: removes visits older than `days` days.
pub fn purge_older_than(conn: &Connection, days: u32) -> Result<u64> {
    let cutoff = now_epoch() - (days as i64) * 86_400;
    clear(conn, Some(cutoff))
}

pub fn now_epoch() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations;
    use rusqlite::{Connection, OptionalExtension};

    /// Queries a single row (test helper).
    fn by_id(conn: &Connection, id: i64) -> Result<Option<HistoryEntry>> {
        conn.query_row(
            "SELECT id, url, title, visit_time, domain FROM history WHERE id = ?1",
            [id],
            map_entry,
        )
        .optional()
        .map_err(Into::into)
    }

    fn fresh() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run(&conn).unwrap();
        conn
    }

    fn seed(conn: &Connection) {
        // Strictly in the past (never the current second) so boundary
        // comparisons in purge/frequent tests stay deterministic.
        let now = now_epoch() - 1;
        record(conn, "https://example.com/a", Some("Alpha"), now - 200).unwrap();
        record(conn, "https://example.com/b", Some("Beta"), now - 100).unwrap();
        record(conn, "https://other.org/c", Some("Gamma"), now).unwrap();
    }

    #[test]
    fn record_stores_domain() {
        let conn = fresh();
        record(&conn, "https://sub.example.com/page", Some("T"), 42).unwrap();
        let entry = by_id(&conn, 1).unwrap().unwrap();
        assert_eq!(entry.domain.as_deref(), Some("sub.example.com"));
        assert_eq!(entry.url, "https://sub.example.com/page");
    }

    #[test]
    fn query_orders_newest_first() {
        let conn = fresh();
        seed(&conn);
        let entries = query(&conn, None, 10).unwrap();
        let urls: Vec<_> = entries.iter().map(|e| e.url.as_str()).collect();
        assert_eq!(
            urls,
            vec![
                "https://other.org/c",
                "https://example.com/b",
                "https://example.com/a"
            ]
        );
    }

    #[test]
    fn query_filters_by_needle() {
        let conn = fresh();
        seed(&conn);
        let entries = query(&conn, Some("beta"), 10).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].title.as_deref(), Some("Beta"));

        let all = query(&conn, Some("example"), 10).unwrap();
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn query_escapes_like_wildcards() {
        let conn = fresh();
        seed(&conn);
        // '%' in the needle must match literally, not act as a wildcard.
        let entries = query(&conn, Some("%"), 10).unwrap();
        assert!(entries.is_empty());
    }

    #[test]
    fn query_clamps_limit() {
        let conn = fresh();
        seed(&conn);
        assert_eq!(query(&conn, None, 0).unwrap().len(), 1);
        assert_eq!(query(&conn, None, 5000).unwrap().len(), 3);
    }

    #[test]
    fn delete_removes_and_reports() {
        let conn = fresh();
        seed(&conn);
        assert!(delete(&conn, 1).unwrap());
        assert!(!delete(&conn, 1).unwrap());
        assert_eq!(query(&conn, None, 10).unwrap().len(), 2);
    }

    #[test]
    fn clear_removes_everything() {
        let conn = fresh();
        seed(&conn);
        assert_eq!(clear(&conn, None).unwrap(), 3);
        assert!(query(&conn, None, 10).unwrap().is_empty());
    }

    #[test]
    fn purge_removes_only_old() {
        let conn = fresh();
        seed(&conn);
        assert_eq!(purge_older_than(&conn, 0).unwrap(), 3);
        // Fresh visits (now) survive a retention window; only re-seeded old
        // timestamps would be purged.
        record(&conn, "https://fresh.example/", Some("Fresh"), now_epoch()).unwrap();
        assert_eq!(purge_older_than(&conn, 365).unwrap(), 0);
        assert_eq!(query(&conn, None, 10).unwrap().len(), 1);
    }

    #[test]
    fn frequent_groups_by_domain() {
        let conn = fresh();
        seed(&conn);
        seed(&conn);
        let frequent = frequent(&conn, 10).unwrap();
        assert_eq!(frequent.len(), 2);
        // example.com has the most visits; its entry is the newest example.com row.
        assert_eq!(frequent[0].domain.as_deref(), Some("example.com"));
        assert_eq!(frequent[0].url, "https://example.com/b");
    }

    #[test]
    fn frequent_excludes_stale_domains() {
        let conn = fresh();
        let now = now_epoch();
        record(
            &conn,
            "https://stale.example/",
            Some("Stale"),
            now - 100 * 86_400,
        )
        .unwrap();
        record(&conn, "https://fresh.example/", Some("Fresh"), now).unwrap();
        let frequent = frequent(&conn, 10).unwrap();
        assert_eq!(frequent.len(), 1);
        assert_eq!(frequent[0].domain.as_deref(), Some("fresh.example"));
    }
}
