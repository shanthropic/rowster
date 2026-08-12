# Rowster — Data Model

## SQLite database

Location: app-data dir (`rowster.db`), WAL mode. Schema is versioned via `PRAGMA user_version` and applied by ordered migrations in `src-tauri/src/db/migrations.rs`. **Never edit an applied migration; append a new one.**

### `history`

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| url | TEXT NOT NULL | |
| title | TEXT | nullable |
| visit_time | INTEGER NOT NULL | Unix epoch seconds |
| domain | TEXT | denormalized for frequent-site grouping |

Indexes: `(visit_time)`, `(domain, visit_time)`.

### `bookmarks`

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| parent_id | INTEGER | self-FK, `ON DELETE CASCADE` (folder tree) |
| title | TEXT NOT NULL | |
| url | TEXT | nullable (folders) |
| position | INTEGER NOT NULL DEFAULT 0 | |
| created_at | INTEGER NOT NULL | |

Deduplication on add is by URL, scoped to folders.

### `downloads`

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| tab_id | INTEGER | originating tab, nullable |
| url | TEXT NOT NULL | |
| filename | TEXT NOT NULL | sanitized |
| path | TEXT | final destination, nullable (prompt rows hold none) |
| mime | TEXT | |
| total_bytes | INTEGER | nullable until known |
| received_bytes | INTEGER NOT NULL DEFAULT 0 | |
| status | TEXT NOT NULL | `requested` \| `active` \| `completed` \| `cancelled` \| `failed` |
| error | TEXT | |
| created_at | INTEGER NOT NULL | |
| finished_at | INTEGER | |

State machine: ask-before rows start `requested`; engine acceptance flips them to `active` with the destination path (no duplicate history entry); completion/cancel/failure are terminal via `finish()`.

### `site_permissions`

| Column | Type | Notes |
|---|---|---|
| origin | TEXT NOT NULL | canonical `scheme://host[:port]` |
| kind | TEXT NOT NULL | `camera` \| `microphone` \| `geolocation` \| `notifications` |
| decision | TEXT NOT NULL | `allow_once` is never persisted; `always_allow` \| `block` |

PK `(origin, kind)`. Rows with unknown kind/decision strings are skipped on read; DB errors propagate.

### `settings`

Key/value with an in-memory validated `Settings` mirror (`src-tauri/src/settings.rs`):

| Key | Type | Notes |
|---|---|---|
| search_engine | string | must be `https://`, must contain `{q}` |
| home_page | string | `http(s)` or empty |
| new_tab_behavior | enum | newtab \| home \| blank |
| restore_session | bool | startup behavior |
| ask_before_download | bool | prompt before each download |
| download_dir | string/None | absolute path only |
| theme | enum | system \| light \| dark |
| zoom_default | f64 | clamped 0.25–5.0 |
| close_last_tab_action | enum | newtab \| close_window |
| history_retention_days | u32 | 0 = keep forever |
| show_bookmark_bar | bool | |
| tab_sleep_after_minutes | u32 | |
| warn_on_form_tabs | bool | |
| language | string | chrome UI language key |

`settings_set` validates + persists synchronously before returning; concurrent patches are serialized.

## Session file

`session.json` in the app-data dir (with `session.json.bak` rotation):

- `version` — validated against `SESSION_VERSION`
- `windows[].active_tab` — index into `tabs`, bounds-checked on load
- `windows[].tabs[]` — `{ url, title, zoom, pinned, muted, navlog }` in **display order** (tab reorder persists automatically)
- `recently_closed[]` — capped at 25, most recent first

Write protocol: serialize → temp file → `sync_all()` → rotate live to `.bak` → rename temp to live. Load: live → on corruption/version mismatch fall back to `.bak` → on URL/zoom/active-index validation failure treat session as absent.

## Filesystem

- App data dir: DB, session, favicon cache (`favicons/` keyed `<scheme>-<host>-<port>.icon`).
- Downloads: user-selected directory; names sanitized (illegal chars, traversal, trailing dots) with ` (2)`, ` (3)`… counter deduplication.