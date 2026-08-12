pub mod caller;
pub mod nav_policy;

#[cfg(test)]
mod tests {
    use serde_json::Value;

    /// The capability ACL must never match a tab webview label (`tab-*`),
    /// and the trusted chrome webview (`main`) must be granted capabilities.
    /// Enforced here as a unit test per the security plan (§12.1).
    #[test]
    fn capabilities_never_cover_tab_webviews() {
        let manifest = std::env::var("CARGO_MANIFEST_DIR").unwrap();
        let raw =
            std::fs::read_to_string(std::path::Path::new(&manifest).join("capabilities/main.json"))
                .expect("capabilities/main.json must exist");
        let parsed: Value =
            serde_json::from_str(&raw).expect("capabilities/main.json must be valid JSON");

        let mut main_covered = false;
        for entry in parsed.as_array().into_iter().flatten().chain(
            // Tauri 2 capability files hold a single object (not an array).
            std::iter::once(&parsed),
        ) {
            let windows = entry
                .get("windows")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            assert!(
                windows.is_empty(),
                "multi-webview capabilities must use `webviews`; a window match grants access to every child tab"
            );
            let webviews = entry
                .get("webviews")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            for label in webviews {
                let label = label.as_str().expect("window labels must be strings");
                assert!(
                    !label.starts_with("tab-"),
                    "capability entry grants permissions to {label}; tab webviews must have zero capabilities"
                );
                if label == "main" {
                    main_covered = true;
                }
            }
        }
        assert!(
            main_covered,
            "the chrome webview label `main` must be covered by a capability"
        );
    }

    /// Every IPC command must assert it was called from the chrome webview.
    /// This source-level scan catches new commands that forget the guard
    /// (defense in depth behind the capability ACL).
    #[test]
    fn every_command_is_caller_guarded() {
        let manifest = std::env::var("CARGO_MANIFEST_DIR").unwrap();
        let source =
            std::fs::read_to_string(std::path::Path::new(&manifest).join("src/commands.rs"))
                .expect("src/commands.rs must exist");

        let marker = "#[tauri::command]";
        let mut start = 0;
        let mut found = 0;
        while let Some(rel) = source[start..].find(marker) {
            let item_start = start + rel;
            let rest = &source[item_start + marker.len()..];
            let next = rest
                .find(marker)
                .map(|i| item_start + marker.len() + i)
                .unwrap_or(source.len());
            let item = &source[item_start..next];
            assert!(
                item.contains("caller::assert_chrome"),
                "command defined between chars {item_start}..{next} is missing caller::assert_chrome"
            );
            found += 1;
            start = next;
        }
        assert!(found > 0, "no #[tauri::command] functions found to scan");
    }
}
