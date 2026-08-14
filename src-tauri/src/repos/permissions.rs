use rusqlite::Connection;
#[cfg(any(not(target_os = "macos"), test))]
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};

use crate::error::Result;

/// Kinds of site permission requests a webview can raise.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionKind {
    Camera,
    Microphone,
    Geolocation,
    Notifications,
}

impl PermissionKind {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Camera => "camera",
            Self::Microphone => "microphone",
            Self::Geolocation => "geolocation",
            Self::Notifications => "notifications",
        }
    }

    fn from_str(s: &str) -> Option<Self> {
        match s {
            "camera" => Some(Self::Camera),
            "microphone" => Some(Self::Microphone),
            "geolocation" => Some(Self::Geolocation),
            "notifications" => Some(Self::Notifications),
            _ => None,
        }
    }
}

/// Stored decision for an (origin, kind) pair.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionDecision {
    /// Allow for this page load only (not persisted).
    AllowOnce,
    /// Always allow for this origin.
    AlwaysAllow,
    /// Always block for this origin.
    Block,
}

impl PermissionDecision {
    fn as_str(&self) -> &'static str {
        match self {
            Self::AllowOnce => "allow_once",
            Self::AlwaysAllow => "always_allow",
            Self::Block => "block",
        }
    }

    fn from_str(s: &str) -> Option<Self> {
        match s {
            "allow_once" => Some(Self::AllowOnce),
            "always_allow" => Some(Self::AlwaysAllow),
            "block" => Some(Self::Block),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct SitePermission {
    pub origin: String,
    pub kind: PermissionKind,
    pub decision: PermissionDecision,
}

pub fn set(
    conn: &Connection,
    origin: &str,
    kind: PermissionKind,
    decision: PermissionDecision,
) -> Result<()> {
    conn.execute(
        "INSERT INTO site_permissions (origin, kind, decision) VALUES (?1, ?2, ?3)
         ON CONFLICT (origin, kind) DO UPDATE SET decision = excluded.decision",
        rusqlite::params![origin, kind.as_str(), decision.as_str()],
    )?;
    Ok(())
}

#[cfg(any(not(target_os = "macos"), test))]
pub fn get(
    conn: &Connection,
    origin: &str,
    kind: PermissionKind,
) -> Result<Option<PermissionDecision>> {
    let row: Option<String> = conn
        .query_row(
            "SELECT decision FROM site_permissions WHERE origin = ?1 AND kind = ?2",
            rusqlite::params![origin, kind.as_str()],
            |r| r.get(0),
        )
        .optional()?;
    Ok(row.and_then(|s| PermissionDecision::from_str(&s)))
}

pub fn list(conn: &Connection) -> Result<Vec<SitePermission>> {
    let mut stmt =
        conn.prepare("SELECT origin, kind, decision FROM site_permissions ORDER BY origin, kind")?;
    let rows = stmt.query_map([], |row| {
        let origin: String = row.get(0)?;
        let kind: String = row.get(1)?;
        let decision: String = row.get(2)?;
        Ok(PermissionKind::from_str(&kind)
            .zip(PermissionDecision::from_str(&decision))
            .map(|(kind, decision)| SitePermission {
                origin,
                kind,
                decision,
            }))
    })?;
    // Rows whose stored kind/decision strings are unknown map to `None` and
    // are skipped; real SQLite errors must propagate, not vanish.
    rows.collect::<std::result::Result<Vec<_>, _>>()
        .map(|rows| rows.into_iter().flatten().collect())
        .map_err(Into::into)
}

pub fn clear(conn: &Connection, origin: &str, kind: PermissionKind) -> Result<u64> {
    Ok(conn.execute(
        "DELETE FROM site_permissions WHERE origin = ?1 AND kind = ?2",
        rusqlite::params![origin, kind.as_str()],
    )? as u64)
}

/// Deletes every stored decision for an origin (used by the settings page).
#[allow(dead_code)]
pub fn clear_origin(conn: &Connection, origin: &str) -> Result<u64> {
    Ok(conn.execute(
        "DELETE FROM site_permissions WHERE origin = ?1",
        rusqlite::params![origin],
    )? as u64)
}

pub fn clear_all(conn: &Connection) -> Result<u64> {
    Ok(conn.execute("DELETE FROM site_permissions", [])? as u64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn fresh() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE site_permissions (
                origin TEXT NOT NULL,
                kind TEXT NOT NULL,
                decision TEXT NOT NULL,
                PRIMARY KEY (origin, kind)
            );",
        )
        .unwrap();
        conn
    }

    #[test]
    fn get_missing_returns_none() {
        let conn = fresh();
        assert!(
            get(&conn, "https://a.test", PermissionKind::Camera)
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn set_then_get_roundtrips() {
        let conn = fresh();
        set(
            &conn,
            "https://a.test",
            PermissionKind::Camera,
            PermissionDecision::AlwaysAllow,
        )
        .unwrap();
        assert_eq!(
            get(&conn, "https://a.test", PermissionKind::Camera).unwrap(),
            Some(PermissionDecision::AlwaysAllow)
        );
        assert!(
            get(&conn, "https://a.test", PermissionKind::Microphone)
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn set_overwrites_existing_decision() {
        let conn = fresh();
        set(
            &conn,
            "https://a.test",
            PermissionKind::Camera,
            PermissionDecision::AlwaysAllow,
        )
        .unwrap();
        set(
            &conn,
            "https://a.test",
            PermissionKind::Camera,
            PermissionDecision::Block,
        )
        .unwrap();
        assert_eq!(
            get(&conn, "https://a.test", PermissionKind::Camera).unwrap(),
            Some(PermissionDecision::Block)
        );
    }

    #[test]
    fn list_orders_by_origin_then_kind() {
        let conn = fresh();
        set(
            &conn,
            "https://z.test",
            PermissionKind::Camera,
            PermissionDecision::AlwaysAllow,
        )
        .unwrap();
        set(
            &conn,
            "https://a.test",
            PermissionKind::Notifications,
            PermissionDecision::Block,
        )
        .unwrap();
        set(
            &conn,
            "https://a.test",
            PermissionKind::Camera,
            PermissionDecision::AlwaysAllow,
        )
        .unwrap();
        let rows = list(&conn).unwrap();
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[0].origin, "https://a.test");
        assert_eq!(rows[0].kind, PermissionKind::Camera);
        assert_eq!(rows[1].kind, PermissionKind::Notifications);
        assert_eq!(rows[2].origin, "https://z.test");
    }

    #[test]
    fn clear_origin_removes_only_that_site() {
        let conn = fresh();
        set(
            &conn,
            "https://a.test",
            PermissionKind::Camera,
            PermissionDecision::Block,
        )
        .unwrap();
        set(
            &conn,
            "https://b.test",
            PermissionKind::Camera,
            PermissionDecision::Block,
        )
        .unwrap();
        assert_eq!(clear_origin(&conn, "https://a.test").unwrap(), 1);
        assert_eq!(list(&conn).unwrap().len(), 1);
    }

    #[test]
    fn clear_all_empties_table() {
        let conn = fresh();
        set(
            &conn,
            "https://a.test",
            PermissionKind::Camera,
            PermissionDecision::Block,
        )
        .unwrap();
        set(
            &conn,
            "https://b.test",
            PermissionKind::Camera,
            PermissionDecision::Block,
        )
        .unwrap();
        assert_eq!(clear_all(&conn).unwrap(), 2);
        assert!(list(&conn).unwrap().is_empty());
    }

    #[test]
    fn unknown_kind_rows_are_skipped_safely() {
        let conn = fresh();
        conn.execute(
            "INSERT INTO site_permissions (origin, kind, decision) VALUES ('https://x.test', 'vibrate', 'allow_once')",
            [],
        )
        .unwrap();
        set(
            &conn,
            "https://z.test",
            PermissionKind::Camera,
            PermissionDecision::Block,
        )
        .unwrap();
        let rows = list(&conn).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].origin, "https://z.test");
    }
}
