use crate::error::{Error, Result};

/// Platform-independent view of a tab webview.
///
/// All methods are synchronous and safe to call from the main thread or from
/// async command handlers (Tauri dispatches webview operations internally).
pub trait WebviewHandle: Send + Sync {
    fn navigate(&self, url: &str) -> Result<()>;
    fn reload(&self) -> Result<()>;
    /// Bypass-cache reload. On Windows this falls back to a plain reload
    /// (WebView2 does not expose a bypass-cache reload).
    fn hard_reload(&self) -> Result<()>;
    fn stop(&self) -> Result<()>;
    fn go_back(&self) -> Result<()>;
    fn go_forward(&self) -> Result<()>;
    fn set_zoom(&self, factor: f64) -> Result<()>;
    /// Runs `js` in the page context (fire-and-forget; no return value).
    fn eval(&self, js: &str) -> Result<()>;
    /// Engine-level mute where supported; elsewhere a page-JS fallback that
    /// must be re-applied after each page load.
    fn set_muted(&self, muted: bool) -> Result<()>;

    fn set_bounds(&self, x: f64, y: f64, w: f64, h: f64) -> Result<()>;
    fn set_visible(&self, visible: bool) -> Result<()>;
    fn set_focus(&self) -> Result<()>;
    fn close(&self) -> Result<()>;
}

/// Live implementation backed by a Tauri child webview.
#[derive(Clone)]
pub struct LiveWebview {
    webview: tauri::Webview,
}

impl LiveWebview {
    pub fn new(webview: tauri::Webview) -> Self {
        Self { webview }
    }
}

impl WebviewHandle for LiveWebview {
    fn navigate(&self, url: &str) -> Result<()> {
        let parsed = url::Url::parse(url).map_err(|e| Error::InvalidAddress(e.to_string()))?;
        self.webview.navigate(parsed).map_err(Error::from)
    }

    fn reload(&self) -> Result<()> {
        self.webview.reload().map_err(Error::from)
    }

    fn hard_reload(&self) -> Result<()> {
        #[cfg(target_os = "macos")]
        {
            use objc2_web_kit::WKWebView;
            let webview = self.webview.clone();
            webview.with_webview(|platform| unsafe {
                let view: &WKWebView = &*platform.inner().cast();
                let _ = view.reloadFromOrigin();
            })?;
            Ok(())
        }
        #[cfg(target_os = "linux")]
        {
            use webkit2gtk::WebViewExt;
            let webview = self.webview.clone();
            webview.with_webview(|platform| {
                platform.inner().reload_bypass_cache();
            })?;
            Ok(())
        }
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        {
            // WebView2 has no public bypass-cache reload; fall back to reload.
            self.webview.reload().map_err(Error::from)
        }
    }

    fn stop(&self) -> Result<()> {
        self.webview.eval("window.stop()").map_err(Error::from)
    }

    fn go_back(&self) -> Result<()> {
        self.webview.eval("history.go(-1)").map_err(Error::from)
    }

    fn go_forward(&self) -> Result<()> {
        self.webview.eval("history.go(1)").map_err(Error::from)
    }

    fn set_zoom(&self, factor: f64) -> Result<()> {
        self.webview.set_zoom(factor).map_err(Error::from)
    }

    fn eval(&self, js: &str) -> Result<()> {
        self.webview.eval(js).map_err(Error::from)
    }

    fn set_muted(&self, muted: bool) -> Result<()> {
        #[cfg(target_os = "macos")]
        {
            use objc2_web_kit::WKWebView;
            let webview = self.webview.clone();
            webview.with_webview(move |platform| unsafe {
                let view: &WKWebView = &*platform.inner().cast();
                view.setMuted(muted);
            })?;
            return Ok(());
        }
        #[cfg(target_os = "linux")]
        {
            use webkit2gtk::WebViewExt;
            let webview = self.webview.clone();
            webview.with_webview(move |platform| {
                platform.inner().set_muted(muted);
            })?;
            return Ok(());
        }
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        {
            // WebView2 exposes IsMuted but not TryMute in the current
            // webview2-com bindings; mute existing media elements instead.
            // New elements (and pages that replace their own DOM) are not
            // covered until the next reapply_mute on load.
            let js = if muted {
                "document.querySelectorAll('video,audio').forEach((e) => { e.muted = true; })"
            } else {
                "document.querySelectorAll('video,audio').forEach((e) => { e.muted = false; })"
            };
            self.webview.eval(js).map_err(Error::from)
        }
    }

    fn set_bounds(&self, x: f64, y: f64, w: f64, h: f64) -> Result<()> {
        self.webview
            .set_position(tauri::LogicalPosition::new(x, y))?;
        self.webview.set_size(tauri::LogicalSize::new(w, h))?;
        Ok(())
    }

    fn set_visible(&self, visible: bool) -> Result<()> {
        if visible {
            self.webview.show()?;
        } else {
            self.webview.hide()?;
        }
        Ok(())
    }

    fn set_focus(&self) -> Result<()> {
        self.webview.set_focus()?;
        Ok(())
    }

    fn close(&self) -> Result<()> {
        self.webview.close()?;
        Ok(())
    }
}
