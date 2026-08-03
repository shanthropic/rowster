use serde::{Deserialize, Serialize};
use url::Url;

use crate::error::{Error, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Theme {
    #[default]
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NewTabBehavior {
    #[default]
    NewTabPage,
    Home,
    Blank,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CloseLastTabAction {
    #[default]
    NewTab,
    CloseWindow,
}

pub const SEARCH_ENGINE_PRESETS: &[(&str, &str)] = &[
    ("DuckDuckGo", "https://duckduckgo.com/?q={q}"),
    ("Google", "https://www.google.com/search?q={q}"),
    ("Bing", "https://www.bing.com/search?q={q}"),
    ("Startpage", "https://www.startpage.com/sp/search?query={q}"),
    ("Brave", "https://search.brave.com/search?q={q}"),
];

/// Fully-validated browser settings, persisted as a JSON row.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Settings {
    #[serde(default = "default_search_engine")]
    pub search_engine: String,
    #[serde(default = "default_home_page")]
    pub home_page: String,
    #[serde(default)]
    pub new_tab_behavior: NewTabBehavior,
    #[serde(default = "default_true")]
    pub restore_session: bool,
    #[serde(default = "default_true")]
    pub ask_before_download: bool,
    #[serde(default)]
    pub download_dir: Option<String>,
    #[serde(default)]
    pub theme: Theme,
    #[serde(default = "default_zoom")]
    pub zoom_default: f64,
    #[serde(default)]
    pub close_last_tab_action: CloseLastTabAction,
    #[serde(default = "default_retention_days")]
    pub history_retention_days: u32,
    #[serde(default)]
    pub show_bookmark_bar: bool,
    #[serde(default)]
    pub tab_sleep_after_minutes: u32,
    #[serde(default = "default_true")]
    pub warn_on_form_tabs: bool,
    #[serde(default = "default_language")]
    pub language: String,
}

fn default_search_engine() -> String {
    SEARCH_ENGINE_PRESETS[0].1.to_string()
}
fn default_home_page() -> String {
    "https://duckduckgo.com/".to_string()
}
fn default_true() -> bool {
    true
}
fn default_zoom() -> f64 {
    1.0
}
fn default_retention_days() -> u32 {
    90
}
fn default_language() -> String {
    "en".to_string()
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            search_engine: default_search_engine(),
            home_page: default_home_page(),
            new_tab_behavior: NewTabBehavior::NewTabPage,
            restore_session: true,
            ask_before_download: true,
            download_dir: None,
            theme: Theme::System,
            zoom_default: default_zoom(),
            close_last_tab_action: CloseLastTabAction::NewTab,
            history_retention_days: default_retention_days(),
            show_bookmark_bar: false,
            tab_sleep_after_minutes: 0,
            warn_on_form_tabs: true,
            language: default_language(),
        }
    }
}

impl Settings {
    /// Validates a full settings value (used when loading from disk).
    pub fn validate(&self) -> Result<()> {
        validate_engine(&self.search_engine)?;
        validate_home_page(&self.home_page)?;
        if let Some(dir) = &self.download_dir
            && !dir.is_empty()
            && !std::path::Path::new(dir).is_absolute()
        {
            return Err(Error::Other(
                "download directory must be an absolute path".into(),
            ));
        }
        validate_zoom(self.zoom_default)?;
        validate_retention(self.history_retention_days)?;
        validate_sleep(self.tab_sleep_after_minutes)?;
        validate_language(&self.language)?;
        Ok(())
    }
}

/// Partial update; every present field is validated before applying.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct SettingsPatch {
    pub search_engine: Option<String>,
    pub home_page: Option<String>,
    pub new_tab_behavior: Option<NewTabBehavior>,
    pub restore_session: Option<bool>,
    pub ask_before_download: Option<bool>,
    pub download_dir: Option<String>,
    pub theme: Option<Theme>,
    pub zoom_default: Option<f64>,
    pub close_last_tab_action: Option<CloseLastTabAction>,
    pub history_retention_days: Option<u32>,
    pub show_bookmark_bar: Option<bool>,
    pub tab_sleep_after_minutes: Option<u32>,
    pub warn_on_form_tabs: Option<bool>,
    pub language: Option<String>,
}

impl Settings {
    /// Applies a validated partial update; returns the resulting settings.
    pub fn apply(&mut self, patch: SettingsPatch) -> Result<()> {
        if let Some(value) = patch.search_engine {
            validate_engine(&value)?;
            self.search_engine = value;
        }
        if let Some(value) = patch.home_page {
            validate_home_page(&value)?;
            self.home_page = value;
        }
        if let Some(value) = patch.new_tab_behavior {
            self.new_tab_behavior = value;
        }
        if let Some(value) = patch.restore_session {
            self.restore_session = value;
        }
        if let Some(value) = patch.ask_before_download {
            self.ask_before_download = value;
        }
        if let Some(value) = patch.download_dir {
            if !value.is_empty() && !std::path::Path::new(&value).is_absolute() {
                return Err(Error::Other(
                    "download directory must be an absolute path".into(),
                ));
            }
            self.download_dir = (!value.is_empty()).then_some(value);
        }
        if let Some(value) = patch.theme {
            self.theme = value;
        }
        if let Some(value) = patch.zoom_default {
            validate_zoom(value)?;
            self.zoom_default = value;
        }
        if let Some(value) = patch.close_last_tab_action {
            self.close_last_tab_action = value;
        }
        if let Some(value) = patch.history_retention_days {
            validate_retention(value)?;
            self.history_retention_days = value;
        }
        if let Some(value) = patch.show_bookmark_bar {
            self.show_bookmark_bar = value;
        }
        if let Some(value) = patch.tab_sleep_after_minutes {
            validate_sleep(value)?;
            self.tab_sleep_after_minutes = value;
        }
        if let Some(value) = patch.warn_on_form_tabs {
            self.warn_on_form_tabs = value;
        }
        if let Some(value) = patch.language {
            validate_language(&value)?;
            self.language = value;
        }
        Ok(())
    }
}

fn validate_engine(template: &str) -> Result<()> {
    if !template.contains("{q}") {
        return Err(Error::Other(
            "search engine template must contain {q}".into(),
        ));
    }
    let url = Url::parse(&template.replace("{q}", "test"))
        .map_err(|_| Error::Other("search engine template is not a valid URL".into()))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(Error::Other(
            "search engine template must use http(s)".into(),
        ));
    }
    Ok(())
}

fn validate_home_page(home: &str) -> Result<()> {
    if home.trim().is_empty() {
        return Ok(());
    }
    let url = Url::parse(home).map_err(|_| Error::Other("home page is not a valid URL".into()))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(Error::Other("home page must use http(s)".into()));
    }
    Ok(())
}

fn validate_zoom(zoom: f64) -> Result<()> {
    if zoom.is_finite() && (0.25..=5.0).contains(&zoom) {
        Ok(())
    } else {
        Err(Error::Other(
            "default zoom must be between 0.25 and 5.0".into(),
        ))
    }
}

fn validate_retention(days: u32) -> Result<()> {
    if days <= 3650 {
        Ok(())
    } else {
        Err(Error::Other(
            "history retention must be at most 3650 days".into(),
        ))
    }
}

fn validate_sleep(minutes: u32) -> Result<()> {
    if minutes <= 10080 {
        Ok(())
    } else {
        Err(Error::Other(
            "tab sleep must be at most 10080 minutes".into(),
        ))
    }
}

fn validate_language(language: &str) -> Result<()> {
    if language == "en" {
        Ok(())
    } else {
        Err(Error::Other(
            "unsupported language (only 'en' in v1)".into(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_valid() {
        let settings = Settings::default();
        settings.validate().unwrap();
    }

    #[test]
    fn rejects_engine_without_template() {
        let mut settings = Settings::default();
        let err = settings
            .apply(SettingsPatch {
                search_engine: Some("https://example.com/search".into()),
                ..Default::default()
            })
            .unwrap_err();
        assert!(err.to_string().contains("{q}"));
    }

    #[test]
    fn rejects_non_http_engine() {
        let mut settings = Settings::default();
        let err = settings
            .apply(SettingsPatch {
                search_engine: Some("file:///etc/passwd?q={q}".into()),
                ..Default::default()
            })
            .unwrap_err();
        assert!(err.to_string().contains("http(s)"));
    }

    #[test]
    fn rejects_bad_home_page() {
        let mut settings = Settings::default();
        assert!(
            settings
                .apply(SettingsPatch {
                    home_page: Some("not a url".into()),
                    ..Default::default()
                })
                .is_err()
        );
    }

    #[test]
    fn empty_home_page_is_allowed() {
        let mut settings = Settings::default();
        settings
            .apply(SettingsPatch {
                home_page: Some(String::new()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(settings.home_page, "");
    }

    #[test]
    fn rejects_out_of_range_zoom() {
        let mut settings = Settings::default();
        assert!(
            settings
                .apply(SettingsPatch {
                    zoom_default: Some(12.0),
                    ..Default::default()
                })
                .is_err()
        );
    }

    #[test]
    fn rejects_relative_download_dir() {
        let mut settings = Settings::default();
        assert!(
            settings
                .apply(SettingsPatch {
                    download_dir: Some("Downloads".into()),
                    ..Default::default()
                })
                .is_err()
        );
    }

    #[test]
    fn patch_applies_partially() {
        let mut settings = Settings::default();
        settings
            .apply(SettingsPatch {
                theme: Some(Theme::Dark),
                zoom_default: Some(1.25),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(settings.theme, Theme::Dark);
        assert_eq!(settings.zoom_default, 1.25);
        assert!(settings.restore_session);
    }

    #[test]
    fn rejects_unknown_language() {
        let mut settings = Settings::default();
        assert!(
            settings
                .apply(SettingsPatch {
                    language: Some("xx".into()),
                    ..Default::default()
                })
                .is_err()
        );
    }
}
