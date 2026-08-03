/// Logical-pixel chrome regions, in window coordinates.
///
/// The chrome webview spans the whole window and paints the title bar, tab
/// strip, toolbar and address bar. Tab webviews are laid out in the remaining
/// rectangle. Values are logical (CSS) pixels, matching what the frontend
/// measures.
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize)]
pub struct Layout {
    /// Height of the chrome region at the top (tab strip + toolbar).
    pub top: f64,
    /// Width of a left chrome region (unused by default, reserved).
    pub left: f64,
    /// Width of a right chrome region (unused by default, reserved).
    pub right: f64,
    /// Height of a bottom chrome region (unused by default, reserved).
    pub bottom: f64,
}

impl Default for Layout {
    fn default() -> Self {
        Self {
            top: 108.0,
            left: 0.0,
            right: 0.0,
            bottom: 0.0,
        }
    }
}

impl Layout {
    /// Clamps frontend-provided values so a hostile or buggy caller cannot
    /// produce negative sizes or push tabs fully off-screen.
    pub fn sanitize(self) -> Self {
        let norm = |v: f64| if v.is_finite() { v.max(0.0) } else { 0.0 };
        Self {
            top: norm(self.top),
            left: norm(self.left),
            right: norm(self.right),
            bottom: norm(self.bottom),
        }
    }

    /// Computes the tab-webview rectangle (logical px) inside a window of the
    /// given logical size.
    pub fn tab_rect(&self, win_w: f64, win_h: f64) -> (f64, f64, f64, f64) {
        let x = self.left;
        let y = self.top;
        let w = (win_w - self.left - self.right).max(0.0);
        let h = (win_h - self.top - self.bottom).max(0.0);
        (x, y, w, h)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tab_rect_fits_inside_window() {
        let l = Layout::default();
        let (x, y, w, h) = l.tab_rect(1280.0, 800.0);
        assert_eq!((x, y), (0.0, 108.0));
        assert_eq!((w, h), (1280.0, 692.0));
        assert!(x + w <= 1280.0 && y + h <= 800.0);
    }

    #[test]
    fn tab_rect_never_negative() {
        let l = Layout::default();
        let (x, y, w, h) = l.tab_rect(50.0, 50.0);
        assert_eq!((x, y), (0.0, 108.0));
        assert_eq!((w, h), (50.0, 0.0));
    }

    #[test]
    fn sanitize_clamps_negative_and_nan() {
        let l = Layout {
            top: -50.0,
            left: f64::NAN,
            right: -1.0,
            bottom: f64::INFINITY,
        };
        let s = l.sanitize();
        assert_eq!((s.top, s.left, s.right, s.bottom), (0.0, 0.0, 0.0, 0.0));
    }

    #[test]
    fn sanitize_keeps_valid_values() {
        let l = Layout {
            top: 96.0,
            left: 220.0,
            right: 0.0,
            bottom: 40.0,
        };
        let s = l.sanitize();
        assert_eq!((s.top, s.left, s.bottom), (96.0, 220.0, 40.0));
    }
}
