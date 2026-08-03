//! In-memory mock of [`WebviewHandle`] used by tab-manager unit tests.
//!
//! Records every interaction so tests can assert on the calls. The record
//! getters are exercised by tests as they grow; the allow is here because
//! not every recorder is read by today's test suite yet.

#![allow(dead_code)]

use std::sync::{Arc, Mutex};

use crate::error::Result;
use crate::webview::handle::WebviewHandle;

#[derive(Debug, Default)]
pub struct MockCalls {
    pub navigations: Mutex<Vec<String>>,
    pub evals: Mutex<Vec<String>>,
    pub bounds: Mutex<Vec<(f64, f64, f64, f64)>>,
    pub visibility: Mutex<Vec<bool>>,
    pub reloads: Mutex<u32>,
    pub hard_reloads: Mutex<u32>,
    pub closes: Mutex<u32>,
    pub focuses: Mutex<u32>,
    pub zooms: Mutex<Vec<f64>>,
    pub mutes: Mutex<Vec<bool>>,
}

#[derive(Clone)]
pub struct MockWebviewHandle {
    pub calls: Arc<MockCalls>,
}

impl MockWebviewHandle {
    pub fn new() -> Self {
        Self {
            calls: Arc::new(MockCalls::default()),
        }
    }

    pub fn bind() -> Arc<dyn WebviewHandle> {
        Arc::new(Self::new())
    }

    pub fn navigations(&self) -> Vec<String> {
        self.calls.navigations.lock().unwrap().clone()
    }

    pub fn visibility(&self) -> Vec<bool> {
        self.calls.visibility.lock().unwrap().clone()
    }

    pub fn bounds(&self) -> Vec<(f64, f64, f64, f64)> {
        self.calls.bounds.lock().unwrap().clone()
    }
}

impl Default for MockWebviewHandle {
    fn default() -> Self {
        Self::new()
    }
}

impl WebviewHandle for MockWebviewHandle {
    fn navigate(&self, url: &str) -> Result<()> {
        self.calls.navigations.lock().unwrap().push(url.to_string());
        Ok(())
    }

    fn reload(&self) -> Result<()> {
        *self.calls.reloads.lock().unwrap() += 1;
        Ok(())
    }

    fn hard_reload(&self) -> Result<()> {
        *self.calls.hard_reloads.lock().unwrap() += 1;
        Ok(())
    }

    fn stop(&self) -> Result<()> {
        self.calls
            .evals
            .lock()
            .unwrap()
            .push("window.stop()".into());
        Ok(())
    }

    fn go_back(&self) -> Result<()> {
        self.calls
            .evals
            .lock()
            .unwrap()
            .push("history.go(-1)".into());
        Ok(())
    }

    fn go_forward(&self) -> Result<()> {
        self.calls
            .evals
            .lock()
            .unwrap()
            .push("history.go(1)".into());
        Ok(())
    }

    fn set_zoom(&self, factor: f64) -> Result<()> {
        self.calls.zooms.lock().unwrap().push(factor);
        Ok(())
    }

    fn eval(&self, js: &str) -> Result<()> {
        self.calls.evals.lock().unwrap().push(js.to_string());
        Ok(())
    }

    fn set_muted(&self, muted: bool) -> Result<()> {
        self.calls.mutes.lock().unwrap().push(muted);
        Ok(())
    }

    fn set_bounds(&self, x: f64, y: f64, w: f64, h: f64) -> Result<()> {
        self.calls.bounds.lock().unwrap().push((x, y, w, h));
        Ok(())
    }

    fn set_visible(&self, visible: bool) -> Result<()> {
        self.calls.visibility.lock().unwrap().push(visible);
        Ok(())
    }

    fn set_focus(&self) -> Result<()> {
        *self.calls.focuses.lock().unwrap() += 1;
        Ok(())
    }

    fn close(&self) -> Result<()> {
        *self.calls.closes.lock().unwrap() += 1;
        Ok(())
    }
}
