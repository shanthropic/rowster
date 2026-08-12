use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};
use crate::model::ClosedTab;
use crate::navlog::NavigationLog;

pub const SESSION_FILE: &str = "session.json";
pub const SESSION_BAK_FILE: &str = "session.json.bak";
pub const SESSION_VERSION: u32 = 1;

/// One tab worth of restore data. Back/forward history is persisted too
/// (via [`NavigationLog`]); the engine history itself is not restorable, so
/// stray `history.go` calls simply no-op until the next load reconciles.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionTab {
    pub url: String,
    pub title: String,
    pub zoom: f64,
    pub pinned: bool,
    pub muted: bool,
    pub navlog: NavigationLog,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionWindow {
    pub active_tab: usize,
    pub tabs: Vec<SessionTab>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionFile {
    pub version: u32,
    pub windows: Vec<SessionWindow>,
    #[serde(default)]
    pub recently_closed: Vec<ClosedTab>,
}

impl SessionFile {
    pub fn empty() -> Self {
        Self {
            version: SESSION_VERSION,
            windows: Vec::new(),
            recently_closed: Vec::new(),
        }
    }
}

/// Atomic session persistence.
///
/// Writes go to `session.json.tmp`, the current file rotates to `.bak`, then
/// the temp file is renamed into place. Load prefers the live file and falls
/// back to the backup when the live file is corrupt or from an unknown
/// version.
#[derive(Clone, Default)]
pub struct Session {
    dir: Option<PathBuf>,
    write_lock: Arc<Mutex<()>>,
}

impl Session {
    pub fn new(dir: PathBuf) -> Self {
        Self {
            dir: Some(dir),
            write_lock: Arc::new(Mutex::new(())),
        }
    }

    pub fn save(&self, file: &SessionFile) -> Result<()> {
        let Some(dir) = self.dir.as_ref() else {
            return Ok(());
        };
        let _write = crate::error::lock(&self.write_lock)?;
        let target = dir.join(SESSION_FILE);
        let backup = dir.join(SESSION_BAK_FILE);
        let tmp = target.with_extension("json.tmp");

        let json = serde_json::to_vec_pretty(file)?;
        let mut temp = std::fs::File::create(&tmp)?;
        std::io::Write::write_all(&mut temp, &json)?;
        temp.sync_all()?;
        if target.exists() {
            if backup.exists() {
                std::fs::remove_file(&backup)?;
            }
            std::fs::rename(&target, &backup)?;
        }
        std::fs::rename(&tmp, &target)?;
        Ok(())
    }

    /// Loads the session, transparently recovering from the backup file.
    /// Returns `Ok(None)` when no session exists yet.
    pub fn load(&self) -> Result<Option<SessionFile>> {
        let Some(dir) = self.dir.as_ref() else {
            return Ok(None);
        };
        let target = dir.join(SESSION_FILE);
        if !target.exists() {
            let backup = dir.join(SESSION_BAK_FILE);
            return if backup.exists() {
                parse_file(&backup).map(Some)
            } else {
                Ok(None)
            };
        }
        match parse_file(&target) {
            Ok(file) => Ok(Some(file)),
            Err(live_error) => {
                log::warn!("session file is invalid ({live_error}); trying backup");
                let backup = dir.join(SESSION_BAK_FILE);
                if backup.exists() {
                    return parse_file(&backup).map(Some).map_err(|backup_error| {
                        Error::Other(format!(
                            "session is corrupt (live: {live_error}; backup: {backup_error})"
                        ))
                    });
                }
                Err(live_error)
            }
        }
    }
}

fn parse_file(path: &Path) -> Result<SessionFile> {
    let raw = std::fs::read_to_string(path)?;
    let file: SessionFile = serde_json::from_str(&raw)?;
    if file.version != SESSION_VERSION {
        return Err(Error::Other(format!(
            "unsupported session version {} (expected {})",
            file.version, SESSION_VERSION
        )));
    }
    validate_session(&file)?;
    Ok(file)
}

fn validate_session(file: &SessionFile) -> Result<()> {
    for window in &file.windows {
        if !window.tabs.is_empty() && window.active_tab >= window.tabs.len() {
            return Err(Error::Other("session active tab is out of bounds".into()));
        }
        for tab in &window.tabs {
            let url = url::Url::parse(&tab.url)?;
            crate::security::nav_policy::validate(&url)
                .map_err(|error| Error::Other(format!("invalid session tab URL: {error}")))?;
            if !tab.zoom.is_finite() || !(0.25..=5.0).contains(&tab.zoom) {
                return Err(Error::Other("session tab zoom is out of range".into()));
            }
        }
    }
    for tab in &file.recently_closed {
        let url = url::Url::parse(&tab.url)?;
        crate::security::nav_policy::validate(&url)
            .map_err(|error| Error::Other(format!("invalid closed-tab URL: {error}")))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "rowster-session-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn sample() -> SessionFile {
        let mut navlog = NavigationLog::new();
        navlog.push("https://example.com/".into(), Some("Example".into()));
        SessionFile {
            version: SESSION_VERSION,
            windows: vec![SessionWindow {
                active_tab: 0,
                tabs: vec![SessionTab {
                    url: "https://example.com/".into(),
                    title: "Example".into(),
                    zoom: 1.0,
                    pinned: false,
                    muted: false,
                    navlog,
                }],
            }],
            recently_closed: vec![ClosedTab {
                url: "https://example.org/".into(),
                title: "Example Org".into(),
            }],
        }
    }

    #[test]
    fn roundtrip_preserves_session() {
        let dir = temp_dir();
        let session = Session::new(dir.clone());
        session.save(&sample()).unwrap();

        let loaded = session.load().unwrap().unwrap();
        assert_eq!(loaded.windows.len(), 1);
        assert_eq!(loaded.windows[0].tabs[0].url, "https://example.com/");
        assert_eq!(
            loaded.windows[0].tabs[0].navlog.current().unwrap().url,
            "https://example.com/"
        );
        assert_eq!(loaded.recently_closed.len(), 1);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn missing_session_returns_none() {
        let dir = temp_dir();
        let session = Session::new(dir.clone());
        assert!(session.load().unwrap().is_none());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn missing_live_file_recovers_from_backup() {
        let dir = temp_dir();
        let session = Session::new(dir.clone());
        session.save(&sample()).unwrap();
        std::fs::rename(dir.join(SESSION_FILE), dir.join(SESSION_BAK_FILE)).unwrap();
        let loaded = session.load().unwrap().unwrap();
        assert_eq!(loaded.windows[0].tabs[0].title, "Example");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn corrupt_live_file_falls_back_to_backup() {
        let dir = temp_dir();
        let session = Session::new(dir.clone());
        session.save(&sample()).unwrap();
        session.save(&sample()).unwrap();
        std::fs::write(dir.join(SESSION_FILE), "garbage{not json").unwrap();

        let loaded = session.load().unwrap().unwrap();
        assert_eq!(loaded.windows[0].tabs[0].title, "Example");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn wrong_version_falls_back_to_backup() {
        let dir = temp_dir();
        let session = Session::new(dir.clone());
        session.save(&sample()).unwrap();
        session.save(&sample()).unwrap();
        let mut file = sample();
        file.version = 999;
        std::fs::write(
            dir.join(SESSION_FILE),
            serde_json::to_string(&file).unwrap(),
        )
        .unwrap();

        // Live file has an unsupported version; the backup still holds v1.
        let loaded = session.load().unwrap().unwrap();
        assert_eq!(loaded.version, SESSION_VERSION);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn save_rotates_backup() {
        let dir = temp_dir();
        let session = Session::new(dir.clone());
        session.save(&sample()).unwrap();
        session.save(&sample()).unwrap();
        session.save(&sample()).unwrap();
        assert!(dir.join(SESSION_BAK_FILE).exists());
        assert!(dir.join(SESSION_FILE).exists());
        assert!(!dir.join("session.json.tmp").exists());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn disabled_session_save_is_noop() {
        let session = Session::default();
        assert!(session.save(&sample()).is_ok());
        assert!(session.load().is_ok());
    }

    #[test]
    fn invalid_tab_url_is_rejected() {
        let mut file = sample();
        file.windows[0].tabs[0].url = "file:///etc/passwd".into();
        assert!(validate_session(&file).is_err());
    }

    #[test]
    fn invalid_active_index_is_rejected() {
        let mut file = sample();
        file.windows[0].active_tab = 3;
        assert!(validate_session(&file).is_err());
    }
}
