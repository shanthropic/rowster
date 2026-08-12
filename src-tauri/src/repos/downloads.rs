use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};

use crate::error::Result;

/// Mirrors the `downloads` table; the canonical record of every download.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Download {
    pub id: i64,
    pub tab_id: Option<i64>,
    pub url: String,
    pub filename: String,
    pub path: Option<String>,
    pub mime: Option<String>,
    pub total_bytes: Option<u64>,
    pub received_bytes: u64,
    pub status: String,
    pub error: Option<String>,
    pub created_at: i64,
    pub finished_at: Option<i64>,
}

impl Download {
    #[allow(dead_code)]
    pub fn is_finished(&self) -> bool {
        matches!(self.status.as_str(), "completed" | "cancelled" | "failed")
    }
}

fn map_download(row: &rusqlite::Row<'_>) -> rusqlite::Result<Download> {
    Ok(Download {
        id: row.get(0)?,
        tab_id: row.get(1)?,
        url: row.get(2)?,
        filename: row.get(3)?,
        path: row.get(4)?,
        mime: row.get(5)?,
        total_bytes: row.get::<_, Option<i64>>(6)?.map(|b| b as u64),
        received_bytes: row.get::<_, i64>(7)? as u64,
        status: row.get(8)?,
        error: row.get(9)?,
        created_at: row.get(10)?,
        finished_at: row.get(11)?,
    })
}

/// Inserts a download row at request time; returns the new record.
pub fn insert(
    conn: &Connection,
    tab_id: Option<i64>,
    url: &str,
    filename: &str,
    path: Option<&str>,
    mime: Option<&str>,
    total_bytes: Option<u64>,
) -> Result<Download> {
    let created_at = now_epoch();
    conn.execute(
        "INSERT INTO downloads (tab_id, url, filename, path, mime, total_bytes, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'active', ?7)",
        params![
            tab_id,
            url,
            filename,
            path,
            mime,
            total_bytes.map(|b| b as i64),
            created_at
        ],
    )?;
    by_id(conn, conn.last_insert_rowid())?
        .ok_or_else(|| crate::error::Error::Other("inserted download was not found".into()))
}

/// Converts an ask-before row into the active engine download without
/// creating a duplicate history entry.
pub fn start_pending(conn: &Connection, id: i64, path: Option<&str>) -> Result<()> {
    let changed = conn.execute(
        "UPDATE downloads SET path = ?1, status = 'active', error = NULL, finished_at = NULL
         WHERE id = ?2 AND status IN ('requested', 'cancelled', 'failed')",
        params![path, id],
    )?;
    if changed == 0 {
        return Err(crate::error::Error::Other(
            "download prompt is no longer pending".into(),
        ));
    }
    Ok(())
}

pub fn mark_requested(conn: &Connection, id: i64) -> Result<()> {
    let changed = conn.execute(
        "UPDATE downloads SET status = 'requested' WHERE id = ?1 AND status = 'active'",
        [id],
    )?;
    if changed == 0 {
        return Err(crate::error::Error::Other(
            "download could not enter requested state".into(),
        ));
    }
    Ok(())
}

pub fn by_id(conn: &Connection, id: i64) -> Result<Option<Download>> {
    conn.query_row(
        "SELECT id, tab_id, url, filename, path, mime, total_bytes, received_bytes,
                status, error, created_at, finished_at FROM downloads WHERE id = ?1",
        [id],
        map_download,
    )
    .optional()
    .map_err(Into::into)
}

/// Newest-first downloads, including finished ones.
pub fn list(conn: &Connection, limit: u64) -> Result<Vec<Download>> {
    let limit = limit.clamp(1, 500) as i64;
    let mut stmt = conn.prepare(
        "SELECT id, tab_id, url, filename, path, mime, total_bytes, received_bytes,
                status, error, created_at, finished_at FROM downloads
         ORDER BY id DESC LIMIT ?1",
    )?;
    let rows = stmt.query_map([limit], map_download)?;
    rows.collect::<std::result::Result<Vec<_>, _>>()
        .map_err(Into::into)
}

/// The most recent row for `url` (used to finalize engine completions).
pub fn latest_by_url(conn: &Connection, url: &str) -> Result<Option<Download>> {
    conn.query_row(
        "SELECT id, tab_id, url, filename, path, mime, total_bytes, received_bytes,
                status, error, created_at, finished_at FROM downloads
         WHERE url = ?1 AND status = 'active' ORDER BY id DESC LIMIT 1",
        [url],
        map_download,
    )
    .optional()
    .map_err(Into::into)
}

pub fn active_by_path(conn: &Connection, path: &str) -> Result<Option<Download>> {
    conn.query_row(
        "SELECT id, tab_id, url, filename, path, mime, total_bytes, received_bytes,
                status, error, created_at, finished_at FROM downloads
         WHERE path = ?1 AND status = 'active' ORDER BY id DESC LIMIT 1",
        [path],
        map_download,
    )
    .optional()
    .map_err(Into::into)
}

/// Progress updates arrive from platform hooks (Windows) and are persisted
/// here; other platforms keep received_bytes = 0 until completion.
#[allow(dead_code)]
pub fn update_progress(
    conn: &Connection,
    id: i64,
    received: u64,
    total: Option<u64>,
) -> Result<()> {
    conn.execute(
        "UPDATE downloads SET received_bytes = ?1, total_bytes = COALESCE(?2, total_bytes) WHERE id = ?3",
        params![received as i64, total.map(|b| b as i64), id],
    )?;
    Ok(())
}

/// Transitions a download to a finished state and stamps `finished_at`.
pub fn finish(conn: &Connection, id: i64, status: &str, error: Option<&str>) -> Result<()> {
    conn.execute(
        "UPDATE downloads SET status = ?1, error = ?2, finished_at = ?3,
                received_bytes = COALESCE(NULLIF(total_bytes, NULL), received_bytes)
         WHERE id = ?4",
        params![status, error, now_epoch(), id],
    )?;
    Ok(())
}

/// Removes one history row; returns whether it existed.
#[allow(dead_code)]
pub fn delete(conn: &Connection, id: i64) -> Result<bool> {
    let changed = conn.execute("DELETE FROM downloads WHERE id = ?1", [id])?;
    Ok(changed > 0)
}

/// Removes all finished downloads from history (active rows are kept so the
/// tray can still cancel them). Returns the number removed.
pub fn clear_finished(conn: &Connection) -> Result<u64> {
    let changed = conn.execute(
        "DELETE FROM downloads WHERE status IN ('completed', 'cancelled', 'failed')",
        [],
    )?;
    Ok(changed as u64)
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

    fn fresh() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run(&conn).unwrap();
        conn
    }

    fn seed(conn: &Connection) -> Download {
        insert(
            conn,
            Some(1),
            "https://example.com/file.zip",
            "file.zip",
            Some("C:\\dl\\file.zip"),
            Some("application/zip"),
            Some(1000),
        )
        .unwrap()
    }

    #[test]
    fn insert_sets_active_and_defaults() {
        let conn = fresh();
        let download = seed(&conn);
        assert_eq!(download.status, "active");
        assert_eq!(download.received_bytes, 0);
        assert_eq!(download.finished_at, None);
        assert_eq!(download.tab_id, Some(1));
    }

    #[test]
    fn list_orders_newest_first() {
        let conn = fresh();
        let a = seed(&conn);
        let b = insert(
            &conn,
            None,
            "https://example.com/b.zip",
            "b.zip",
            None,
            None,
            None,
        )
        .unwrap();
        let all = list(&conn, 10).unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].id, b.id);
        assert_eq!(all[1].id, a.id);
    }

    #[test]
    fn latest_by_url_finds_newest() {
        let conn = fresh();
        let first = seed(&conn);
        insert(
            &conn,
            None,
            "https://example.com/file.zip",
            "file (2).zip",
            None,
            None,
            None,
        )
        .unwrap();
        let latest = latest_by_url(&conn, "https://example.com/file.zip")
            .unwrap()
            .unwrap();
        assert_ne!(latest.id, first.id);
        assert_eq!(latest.filename, "file (2).zip");
    }

    #[test]
    fn active_by_path_disambiguates_identical_urls() {
        let conn = fresh();
        let first = seed(&conn);
        let second = insert(
            &conn,
            Some(1),
            "https://example.com/file.zip",
            "file (1).zip",
            Some("C:\\dl\\file (1).zip"),
            None,
            None,
        )
        .unwrap();
        assert_eq!(
            active_by_path(&conn, "C:\\dl\\file.zip")
                .unwrap()
                .map(|row| row.id),
            Some(first.id)
        );
        assert_ne!(first.id, second.id);
    }

    #[test]
    fn finish_stamps_status_and_time() {
        let conn = fresh();
        let download = seed(&conn);
        finish(&conn, download.id, "completed", None).unwrap();
        let finished = by_id(&conn, download.id).unwrap().unwrap();
        assert_eq!(finished.status, "completed");
        assert!(finished.finished_at.is_some());
        assert!(finished.received_bytes > 0);
    }

    #[test]
    fn update_progress_preserves_unknown_total() {
        let conn = fresh();
        let download = seed(&conn);
        update_progress(&conn, download.id, 400, None).unwrap();
        let row = by_id(&conn, download.id).unwrap().unwrap();
        assert_eq!(row.received_bytes, 400);
        assert_eq!(row.total_bytes, Some(1000));
    }

    #[test]
    fn start_pending_reuses_the_prompt_row() {
        let conn = fresh();
        let pending = insert(
            &conn,
            Some(1),
            "https://example.com/file.zip",
            "file.zip",
            None,
            None,
            None,
        )
        .unwrap();
        mark_requested(&conn, pending.id).unwrap();
        start_pending(&conn, pending.id, Some("C:\\dl\\file.zip")).unwrap();
        let rows = list(&conn, 10).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].path.as_deref(), Some("C:\\dl\\file.zip"));
    }

    #[test]
    fn clear_finished_keeps_active() {
        let conn = fresh();
        let active = seed(&conn);
        let other = seed(&conn);
        finish(&conn, active.id, "completed", None).unwrap();
        assert_eq!(clear_finished(&conn).unwrap(), 1);
        assert!(by_id(&conn, other.id).unwrap().is_some());
    }

    #[test]
    fn delete_removes_row() {
        let conn = fresh();
        let download = seed(&conn);
        assert!(delete(&conn, download.id).unwrap());
        assert!(by_id(&conn, download.id).unwrap().is_none());
    }

    #[test]
    fn is_finished_reflects_status() {
        assert!(
            Download {
                status: "completed".into(),
                ..dummy()
            }
            .is_finished()
        );
        assert!(
            Download {
                status: "cancelled".into(),
                ..dummy()
            }
            .is_finished()
        );
        assert!(
            !Download {
                status: "active".into(),
                ..dummy()
            }
            .is_finished()
        );
    }

    fn dummy() -> Download {
        Download {
            id: 0,
            tab_id: None,
            url: String::new(),
            filename: String::new(),
            path: None,
            mime: None,
            total_bytes: None,
            received_bytes: 0,
            status: "active".into(),
            error: None,
            created_at: 0,
            finished_at: None,
        }
    }
}
