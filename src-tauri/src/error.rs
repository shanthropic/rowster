use serde::Serializer;

/// Unified error type for all Rowster backend operations.
///
/// Errors are serialized to their `Display` form when they cross the IPC
/// boundary, so every variant has a human-readable message.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("tab not found: {0}")]
    TabNotFound(String),
    #[error("window not found: {0}")]
    WindowNotFound(String),
    #[error("invalid address: {0}")]
    InvalidAddress(String),
    #[error("navigation blocked: {0}")]
    NavigationBlocked(String),
    #[error("untrusted caller (webview `{0}` is not the chrome)")]
    UntrustedCaller(String),
    #[error("internal state poisoned")]
    StatePoisoned,
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("tauri error: {0}")]
    Tauri(#[from] tauri::Error),
    #[error("opener error: {0}")]
    Opener(#[from] tauri_plugin_opener::Error),
    #[error("db error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("serde error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("url parse error: {0}")]
    Url(#[from] url::ParseError),
    #[error("{0}")]
    Other(String),
}

impl serde::Serialize for Error {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<String> for Error {
    fn from(value: String) -> Self {
        Self::Other(value)
    }
}

impl From<&str> for Error {
    fn from(value: &str) -> Self {
        Self::Other(value.to_string())
    }
}

/// Locks a `std::sync::Mutex`, mapping poison errors to [`Error::StatePoisoned`].
/// Never panics in production code.
pub fn lock<T>(
    mutex: &std::sync::Mutex<T>,
) -> std::result::Result<std::sync::MutexGuard<'_, T>, Error> {
    mutex.lock().map_err(|_| Error::StatePoisoned)
}

pub type Result<T> = std::result::Result<T, Error>;
