/** Mirrors src-tauri/src/model.rs. Keep the two in sync. */

export type TabId = number;

/** Mirrors ChromePage in src-tauri/src/model.rs. */
export type ChromePage = "settings" | "history" | "bookmarks" | "downloads";

export interface TabInfo {
  id: TabId;
  title: string;
  url: string;
  favicon_url: string | null;
  loading: boolean;
  /** True while the tab still sits on the fresh about:blank page. */
  is_new: boolean;
  /** Chrome-local page shown in place of the new-tab overlay. */
  chrome_page: ChromePage | null;
  audio: boolean;
  muted: boolean;
  /** True while the tab is hidden by the sleep sweeper. */
  sleeping: boolean;
  discarded: boolean;
  pinned: boolean;
  zoom: number;
  can_go_back: boolean;
  can_go_forward: boolean;
  is_active: boolean;
}

export interface BrowserWindowInfo {
  id: number;
  active_tab_id: TabId | null;
  tabs: TabInfo[];
}

export interface BrowserSnapshot {
  windows: BrowserWindowInfo[];
}

export interface ChromeLayout {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

/** Mirrors settings.rs in src-tauri. */
export type ThemeMode = "system" | "light" | "dark";
export type TabLayout = "horizontal" | "vertical";
export type NewTabBehavior = "new_tab_page" | "home" | "blank";
export type CloseLastTabAction = "new_tab" | "close_window";

export interface Settings {
  search_engine: string;
  home_page: string;
  new_tab_behavior: NewTabBehavior;
  restore_session: boolean;
  ask_before_download: boolean;
  download_dir: string | null;
  theme: ThemeMode;
  tab_layout: TabLayout;
  zoom_default: number;
  close_last_tab_action: CloseLastTabAction;
  history_retention_days: number;
  show_bookmark_bar: boolean;
  tab_sleep_after_minutes: number;
  warn_on_form_tabs: boolean;
  language: string;
}

/** Mirrors SettingsPatch in src-tauri/src/settings.rs (all fields optional). */
export type SettingsPatch = Partial<Settings>;

/** Mirrors repos/history.rs HistoryEntry. */
export interface HistoryEntry {
  id: number;
  url: string;
  title: string | null;
  visit_time: number;
  domain: string | null;
}

/** Mirrors model.rs ClosedTab. */
export interface ClosedTab {
  url: string;
  title: string;
}

/** Mirrors repos/bookmarks.rs Bookmark. */
export interface Bookmark {
  id: number;
  parent_id: number | null;
  title: string;
  url: string | null;
  position: number;
  created_at: number;
}

/** Mirrors repos/downloads.rs Download. */
export type DownloadStatus = "requested" | "active" | "completed" | "cancelled" | "failed";

export interface Download {
  id: number;
  tab_id: number | null;
  url: string;
  filename: string;
  path: string | null;
  mime: string | null;
  total_bytes: number | null;
  received_bytes: number;
  status: DownloadStatus;
  error: string | null;
  created_at: number;
  finished_at: number | null;
}

/** Mirrors downloads.rs DownloadRequestedPayload. */
export interface DownloadRequested {
  id: number;
  tab_id: number;
  url: string;
  filename: string;
}

/** Payload of the executable-open confirmation prompt. */
export interface DownloadOpenConfirm {
  id: number;
  path: string;
  filename: string;
}

/** Mirrors repos/permissions.rs PermissionKind. */
export type PermissionKind = "camera" | "microphone" | "geolocation" | "notifications";

/** Mirrors repos/permissions.rs PermissionDecision. */
export type PermissionDecision = "allow_once" | "always_allow" | "block";

/** Mirrors repos/permissions.rs SitePermission. */
export interface SitePermission {
  origin: string;
  kind: PermissionKind;
  decision: PermissionDecision;
}

/** Mirrors permissions.rs PermissionRequestedPayload. */
export interface PermissionRequested {
  tab_id: TabId;
  origin: string;
  kind: PermissionKind;
}

/** Mirrors find.rs FindStatus. */
export interface FindStatus {
  query: string;
  match_count: number | null;
  case_sensitive: boolean;
}

/** Mirrors find.rs FindStatusPayload (status null = session closed). */
export interface FindStatusPayload {
  tab_id: TabId;
  status: FindStatus | null;
}
