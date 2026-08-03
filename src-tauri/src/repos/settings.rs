use rusqlite::{Connection, OptionalExtension};

use crate::error::Result;
use crate::settings::Settings;

const APP_KEY: &str = "app";

/// Loads settings, falling back to defaults when the row is missing or the
/// stored JSON fails validation (logged, never fatal).
pub fn load(conn: &Connection) -> Result<Settings> {
    let json: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            [APP_KEY],
            |row| row.get(0),
        )
        .optional()?;

    match json {
        None => Ok(Settings::default()),
        Some(json) => match serde_json::from_str::<Settings>(&json) {
            Ok(settings) => match settings.validate() {
                Ok(()) => Ok(settings),
                Err(e) => {
                    log::warn!("stored settings failed validation ({e}); using defaults");
                    Ok(Settings::default())
                }
            },
            Err(e) => {
                log::warn!("stored settings are corrupt ({e}); using defaults");
                Ok(Settings::default())
            }
        },
    }
}

/// Upserts the settings row.
pub fn save(conn: &Connection, settings: &Settings) -> Result<()> {
    settings.validate()?;
    let json = serde_json::to_string(settings)?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [APP_KEY, &json],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations;
    use crate::settings::Theme;
    use rusqlite::Connection;

    fn fresh() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run(&conn).unwrap();
        conn
    }

    #[test]
    fn missing_row_returns_defaults() {
        let conn = fresh();
        let settings = load(&conn).unwrap();
        assert!(settings.restore_session);
        assert_eq!(settings.theme, Theme::System);
    }

    #[test]
    fn roundtrip_preserves_values() {
        let conn = fresh();
        let settings = Settings {
            theme: Theme::Dark,
            zoom_default: 1.5,
            ..Settings::default()
        };
        save(&conn, &settings).unwrap();

        let loaded = load(&conn).unwrap();
        assert_eq!(loaded.theme, Theme::Dark);
        assert_eq!(loaded.zoom_default, 1.5);
    }

    #[test]
    fn corrupt_row_falls_back_to_defaults() {
        let conn = fresh();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('app', 'not json at all')",
            [],
        )
        .unwrap();
        let settings = load(&conn).unwrap();
        assert_eq!(settings.theme, Theme::System);
    }

    #[test]
    fn save_rejects_invalid_settings() {
        let conn = fresh();
        let settings = Settings {
            zoom_default: 99.0,
            ..Settings::default()
        };
        assert!(save(&conn, &settings).is_err());
    }
}
