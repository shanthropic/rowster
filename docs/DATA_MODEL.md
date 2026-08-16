# Rowster — Data Model

---

## Authentication Profile (`auth.json`)

Location: app-data directory (`auth.json`).

Stores the master authentication profile for the browser instance. Handled by `src-tauri/src/auth.rs`.

### Schema

| Field | Type | Description |
|---|---|---|
| `version` | `u32` | Schema version (currently `1`) |
| `name` | `string` | User display name (1–80 printable characters) |
| `password_hash` | `string` \| `null` | PHC-formatted Argon2id password hash |
| `passkey_enabled` | `bool` | Flag indicating whether native biometric / passkey unlock is enabled |

### Write Protocol & Persistence Security

1. Profile serialized to JSON in memory.
2. Written to temporary file `auth.json.tmp`.
3. File synced to disk via `sync_all()`.
4. Strict private permissions applied (mode `0600` on POSIX systems).
5. Atomic replacement onto `auth.json` (via atomic rename on POSIX, `MoveFileExW` with `MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH` on Windows).

---

## SQLite Database (`rowster.db`)

Location: app-data directory (`rowster.db`), running in Write-Ahead Logging (WAL) mode. Schema migrations are strictly ordered and tracked using `PRAGMA user_version` in `src-tauri/src/db/migrations.rs`.

### `history`

| Column | Type | Notes |
|---|---|---|
| `id` | `INTEGER PRIMARY KEY` | Auto-incrementing identifier |
| `url` | `TEXT NOT NULL` | Visited URL string |
| `title` | `TEXT` | Document title (nullable) |
| `visit_time` | `INTEGER NOT NULL` | Visit timestamp in Unix epoch seconds |
| `domain` | `TEXT` | Extracted domain for 90-day frequent-site ranking |

Indexes: `(visit_time)`, `(domain, visit_time)`.

### `bookmarks`

| Column | Type | Notes |
|---|---|---|
| `id` | `INTEGER PRIMARY KEY` | Auto-incrementing identifier |
| `parent_id` | `INTEGER` | Parent folder ID (self-referential FK with `ON DELETE CASCADE`) |
| `title` | `TEXT NOT NULL` | Bookmark display title |
| `url` | `TEXT` | Bookmark destination URL (nullable for folder nodes) |
| `position` | `INTEGER NOT NULL DEFAULT 0` | Ordering index within the parent container |
| `created_at` | `INTEGER NOT NULL` | Creation timestamp in Unix epoch seconds |

Deduplication on insertion is scoped by URL within each folder.

### `downloads`

| Column | Type | Notes |
|---|---|---|
| `id` | `INTEGER PRIMARY KEY` | Auto-incrementing identifier |
| `tab_id` | `INTEGER` | Originating tab identifier (nullable) |
| `url` | `TEXT NOT NULL` | Source download URL |
| `filename` | `TEXT NOT NULL` | Sanitized destination filename |
| `path` | `TEXT` | Absolute destination path on disk (nullable during prompt stage) |
| `mime` | `TEXT` | Content MIME type |
| `total_bytes` | `INTEGER` | Total file size in bytes (nullable if unknown) |
| `received_bytes` | `INTEGER NOT NULL DEFAULT 0` | Current bytes received count |
| `status` | `TEXT NOT NULL` | Status state: `requested`, `active`, `completed`, `cancelled`, `failed` |
| `error` | `TEXT` | Error description if download failed |
| `created_at` | `INTEGER NOT NULL` | Download start timestamp in Unix epoch seconds |
| `finished_at` | `INTEGER` | Completion timestamp in Unix epoch seconds |

### `site_permissions`

| Column | Type | Notes |
|---|---|---|
| `origin` | `TEXT NOT NULL` | Canonical origin string (`scheme://host[:port]`) |
| `kind` | `TEXT NOT NULL` | Permission type: `camera`, `microphone`, `geolocation`, `notifications` |
| `decision` | `TEXT NOT NULL` | Stored decision: `always_allow`, `block` (`allow_once` is transient) |

Primary Key: `(origin, kind)`.

### `settings`

Key-value store synchronized with an in-memory validated `Settings` model (`src-tauri/src/settings.rs`):

| Key | Type | Constraints / Validation |
|---|---|---|
| `search_engine` | `string` | Must start with `https://` and include `{q}` placeholder |
| `home_page` | `string` | Valid `http(s)` URL or empty string |
| `new_tab_behavior` | `enum` | `new_tab_page`, `home`, `blank` |
| `restore_session` | `bool` | Flag determining whether previous tabs restore on startup |
| `ask_before_download` | `bool` | Flag prompting destination confirmation per download |
| `download_dir` | `string` \| `null` | Valid absolute filesystem directory |
| `theme` | `enum` | `system`, `light`, `dark` |
| `zoom_default` | `f64` | Default page zoom level, clamped between `0.25` and `5.0` |
| `close_last_tab_action` | `enum` | `new_tab`, `close_window` |
| `history_retention_days` | `u32` | Number of days to retain history entries (`0` = indefinitely) |
| `show_bookmark_bar` | `bool` | Visibility of the bookmark bar |
| `tab_sleep_after_minutes` | `u32` | Inactivity interval in minutes before discarding tab webview |
| `warn_on_form_tabs` | `bool` | Flag prompting confirmation when closing tabs with unsubmitted forms |
| `language` | `string` | Chrome interface localization language key |

---

## Session File (`session.json`)

Location: app-data directory (`session.json`), with automated `session.json.bak` rotation.

### Schema

- `version`: Numeric format version verified against `SESSION_VERSION`.
- `windows[].active_tab`: Zero-based index of the currently focused tab, bounds-checked upon restoration.
- `windows[].tabs[]`: Ordered array of tab snapshots `{ url, title, zoom, pinned, muted, navlog }`.
- `recently_closed[]`: FIFO list of recently closed tab snapshots (capped at 25 items).

---

## Filesystem Layout

- **App Data Directory**:
  - Windows: `%APPDATA%\com.rowster.app\`
  - Linux: `~/.config/com.rowster.app/`
  - macOS: `~/Library/Application Support/com.rowster.app/`
  - Contains: `auth.json`, `rowster.db`, `session.json`, `session.json.bak`, `favicons/` cache, and `rowster.log`.
- **Downloads Directory**: User-configured directory; filenames are sanitized to remove directory traversal and invalid characters, with counter-based deduplication (` (1)`, ` (2)`).