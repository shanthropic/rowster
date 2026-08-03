use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;

use crate::error::Result;

#[derive(Debug, Clone, Serialize)]
pub struct Bookmark {
    pub id: i64,
    pub parent_id: Option<i64>,
    pub title: String,
    pub url: Option<String>,
    pub position: i64,
    pub created_at: i64,
}

fn map_bookmark(row: &rusqlite::Row<'_>) -> rusqlite::Result<Bookmark> {
    Ok(Bookmark {
        id: row.get(0)?,
        parent_id: row.get(1)?,
        title: row.get(2)?,
        url: row.get(3)?,
        position: row.get(4)?,
        created_at: row.get(5)?,
    })
}

/// Inserts a bookmark, deduplicating on url: adding a URL that is already
/// bookmarked returns the existing row instead of creating a second one.
pub fn add(conn: &Connection, parent_id: Option<i64>, title: &str, url: &str) -> Result<Bookmark> {
    if let Some(existing) = find_by_url(conn, url, parent_id)? {
        return Ok(existing);
    }
    let position: i64 = conn.query_row(
        "SELECT COALESCE(MAX(position), -1) + 1 FROM bookmarks WHERE parent_id IS ?1",
        [parent_id],
        |r| r.get(0),
    )?;
    let created_at = now_epoch();
    conn.execute(
        "INSERT INTO bookmarks (parent_id, title, url, position, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![parent_id, title, url, position, created_at],
    )?;
    Ok(by_id(conn, conn.last_insert_rowid())?.expect("just inserted"))
}

/// Bookmarks in display order (roots first, then each folder's children).
pub fn query(conn: &Connection) -> Result<Vec<Bookmark>> {
    let mut stmt = conn.prepare(
        "SELECT id, parent_id, title, url, position, created_at FROM bookmarks
         ORDER BY COALESCE(parent_id, 0), position",
    )?;
    let rows = stmt.query_map([], map_bookmark)?;
    rows.collect::<std::result::Result<Vec<_>, _>>()
        .map_err(Into::into)
}

/// Case-insensitive search over titles and urls, newest first.
pub fn search(conn: &Connection, needle: &str, limit: u64) -> Result<Vec<Bookmark>> {
    let needle = needle.trim();
    if needle.is_empty() {
        return Ok(Vec::new());
    }
    let limit = limit.clamp(1, 500) as i64;
    let like = format!("%{}%", needle.replace(['%', '_'], "\\$0"));
    let mut stmt = conn.prepare(
        "SELECT id, parent_id, title, url, position, created_at FROM bookmarks
         WHERE title LIKE ?1 ESCAPE '\\' OR url LIKE ?1 ESCAPE '\\'
         ORDER BY created_at DESC LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![like, limit], map_bookmark)?;
    rows.collect::<std::result::Result<Vec<_>, _>>()
        .map_err(Into::into)
}

pub fn by_id(conn: &Connection, id: i64) -> Result<Option<Bookmark>> {
    conn.query_row(
        "SELECT id, parent_id, title, url, position, created_at FROM bookmarks WHERE id = ?1",
        [id],
        map_bookmark,
    )
    .optional()
    .map_err(Into::into)
}

fn find_by_url(conn: &Connection, url: &str, parent_id: Option<i64>) -> Result<Option<Bookmark>> {
    conn.query_row(
        "SELECT id, parent_id, title, url, position, created_at FROM bookmarks
         WHERE url = ?1 AND parent_id IS ?2",
        params![url, parent_id],
        map_bookmark,
    )
    .optional()
    .map_err(Into::into)
}

/// Updates title/url; returns whether the row existed.
pub fn update(conn: &Connection, id: i64, title: &str, url: &str) -> Result<bool> {
    let changed = conn.execute(
        "UPDATE bookmarks SET title = ?1, url = ?2 WHERE id = ?3",
        params![title, url, id],
    )?;
    Ok(changed > 0)
}

/// Removes a bookmark (children cascade via the FK).
pub fn delete(conn: &Connection, id: i64) -> Result<bool> {
    let changed = conn.execute("DELETE FROM bookmarks WHERE id = ?1", [id])?;
    Ok(changed > 0)
}

/// Removes every bookmark (used by "clear browsing data").
pub fn clear(conn: &Connection) -> Result<u64> {
    let changed = conn.execute("DELETE FROM bookmarks", [])?;
    Ok(changed as u64)
}

/// Whether `url` is bookmarked anywhere (drives the address-bar star).
pub fn is_bookmarked(conn: &Connection, url: &str) -> Result<bool> {
    let found: Option<i64> = conn
        .query_row(
            "SELECT id FROM bookmarks WHERE url = ?1 LIMIT 1",
            [url],
            |r| r.get(0),
        )
        .optional()?;
    Ok(found.is_some())
}

/// Removes a bookmark by URL (star toggle off). Returns the removed id, if any.
pub fn delete_by_url(conn: &Connection, url: &str) -> Result<Option<i64>> {
    let id = by_id_for_url(conn, url)?;
    if let Some(id) = id {
        delete(conn, id)?;
    }
    Ok(id)
}

fn by_id_for_url(conn: &Connection, url: &str) -> Result<Option<i64>> {
    conn.query_row(
        "SELECT id FROM bookmarks WHERE url = ?1 LIMIT 1",
        [url],
        |r| r.get(0),
    )
    .optional()
    .map_err(Into::into)
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

    #[test]
    fn add_then_query_returns_in_order() {
        let conn = fresh();
        add(&conn, None, "Alpha", "https://a.example/").unwrap();
        add(&conn, None, "Beta", "https://b.example/").unwrap();
        let all = query(&conn).unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].title, "Alpha");
        assert_eq!(all[1].title, "Beta");
        assert_eq!(all[1].position, 1);
    }

    #[test]
    fn add_deduplicates_on_url() {
        let conn = fresh();
        let first = add(&conn, None, "Alpha", "https://a.example/").unwrap();
        let second = add(&conn, None, "Alpha Again", "https://a.example/").unwrap();
        assert_eq!(first.id, second.id);
        assert_eq!(query(&conn).unwrap().len(), 1);
    }

    #[test]
    fn folders_scope_dedup() {
        let conn = fresh();
        let root = add(&conn, None, "Root", "https://a.example/").unwrap();
        let in_folder = add(&conn, Some(root.id), "In Folder", "https://a.example/").unwrap();
        assert_ne!(root.id, in_folder.id);
        assert_eq!(query(&conn).unwrap().len(), 2);
    }

    #[test]
    fn update_changes_fields() {
        let conn = fresh();
        let added = add(&conn, None, "Old", "https://old.example/").unwrap();
        assert!(update(&conn, added.id, "New", "https://new.example/").unwrap());
        let fetched = by_id(&conn, added.id).unwrap().unwrap();
        assert_eq!(fetched.title, "New");
        assert_eq!(fetched.url.as_deref(), Some("https://new.example/"));
    }

    #[test]
    fn delete_removes_bookmark() {
        let conn = fresh();
        let added = add(&conn, None, "Alpha", "https://a.example/").unwrap();
        assert!(delete(&conn, added.id).unwrap());
        assert!(!delete(&conn, added.id).unwrap());
        assert!(by_id(&conn, added.id).unwrap().is_none());
    }

    #[test]
    fn is_bookmarked_matches_url() {
        let conn = fresh();
        assert!(!is_bookmarked(&conn, "https://a.example/").unwrap());
        add(&conn, None, "Alpha", "https://a.example/").unwrap();
        assert!(is_bookmarked(&conn, "https://a.example/").unwrap());
    }

    #[test]
    fn delete_by_url_returns_id_once() {
        let conn = fresh();
        let added = add(&conn, None, "Alpha", "https://a.example/").unwrap();
        assert_eq!(
            delete_by_url(&conn, "https://a.example/").unwrap(),
            Some(added.id)
        );
        assert_eq!(delete_by_url(&conn, "https://a.example/").unwrap(), None);
    }

    #[test]
    fn search_matches_title_and_url() {
        let conn = fresh();
        add(&conn, None, "Rowster Docs", "https://docs.rowster.app/").unwrap();
        add(&conn, None, "Other", "https://example.com/").unwrap();
        let by_title = search(&conn, "rowster", 10).unwrap();
        assert_eq!(by_title.len(), 1);
        let by_url = search(&conn, "example", 10).unwrap();
        assert_eq!(by_url.len(), 1);
        assert_eq!(by_url[0].title, "Other");
        // '%' is matched literally, never as a wildcard.
        assert!(search(&conn, "%", 10).unwrap().is_empty());
    }

    #[test]
    fn clear_removes_every_bookmark() {
        let conn = fresh();
        add(&conn, None, "Alpha", "https://a.example/").unwrap();
        add(&conn, None, "Beta", "https://b.example/").unwrap();
        assert_eq!(clear(&conn).unwrap(), 2);
        assert!(query(&conn).unwrap().is_empty());
    }

    #[test]
    fn search_with_blank_needle_is_empty() {
        let conn = fresh();
        add(&conn, None, "Alpha", "https://a.example/").unwrap();
        assert!(search(&conn, "  ", 10).unwrap().is_empty());
    }
}
