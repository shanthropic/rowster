import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  Bookmark,
  BrowserSnapshot,
  ChromeLayout,
  ChromePage,
  ClosedTab,
  Download,
  FindStatus,
  HistoryEntry,
  PermissionDecision,
  PermissionKind,
  Settings,
  SettingsPatch,
  SitePermission,
  TabId,
  TabInfo,
} from "./types";

/** Event names, mirrored from src-tauri/src/events.rs. */
export const EV = {
  TABS_SNAPSHOT: "tabs_snapshot",
  TAB_CREATED: "tab_created",
  TAB_CLOSED: "tab_closed",
  TAB_ACTIVATED: "tab_activated",
  URL_CHANGED: "url_changed",
  TITLE_CHANGED: "title_changed",
  LOADING_CHANGED: "loading_changed",
  NAV_STATE_CHANGED: "nav_state_changed",
  ZOOM_CHANGED: "zoom_changed",
  SETTINGS_CHANGED: "settings_changed",
  BOOKMARKS_CHANGED: "bookmarks_changed",
  DOWNLOAD_REQUESTED: "download_requested",
  DOWNLOAD_STARTED: "download_started",
  DOWNLOAD_COMPLETED: "download_completed",
  DOWNLOAD_FAILED: "download_failed",
  DOWNLOAD_CANCELLED: "download_cancelled",
  DOWNLOAD_OPEN_CONFIRM: "download_open_confirm",
  PERMISSION_REQUESTED: "permission_requested",
  FIND_STATUS: "find_status",
  FAVICON_CHANGED: "favicon_changed",
} as const;

export interface FaviconChangedPayload {
  id: TabId;
  favicon_url: string | null;
}

export interface IdPayload {
  id: TabId;
}
export interface UrlChangedPayload extends IdPayload {
  url: string;
}
export interface TitleChangedPayload extends IdPayload {
  title: string;
}
export interface LoadingChangedPayload extends IdPayload {
  loading: boolean;
}
export interface NavStateChangedPayload extends IdPayload {
  can_go_back: boolean;
  can_go_forward: boolean;
}
export interface ZoomChangedPayload extends IdPayload {
  zoom: number;
}

export const startupInfo = () => invoke<BrowserSnapshot>("startup_info");

export const tabCreate = () => invoke<TabInfo>("tab_create");
export const tabActivate = (id: TabId) => invoke<void>("tab_activate", { id });
export const tabClose = (id: TabId) => invoke<void>("tab_close", { id });

export const navigate = (id: TabId, address: string) =>
  invoke<void>("navigate", { id, address });
export const goBack = (id: TabId) => invoke<boolean>("go_back", { id });
export const goForward = (id: TabId) => invoke<boolean>("go_forward", { id });
export const reload = (id: TabId) => invoke<void>("reload", { id });
export const hardReload = (id: TabId) => invoke<void>("hard_reload", { id });
export const stop = (id: TabId) => invoke<void>("stop", { id });

export const setZoom = (id: TabId, factor: number) =>
  invoke<number>("set_zoom", { id, factor });
export const zoomIn = (id: TabId) => invoke<number>("zoom_in", { id });
export const zoomOut = (id: TabId) => invoke<number>("zoom_out", { id });
export const zoomReset = (id: TabId) => invoke<number>("zoom_reset", { id });

export const chromeLayoutChanged = (layout: {
  top: number;
  bottom: number;
  left: number;
  right: number;
}) => invoke<ChromeLayout>("chrome_layout_changed", layout);

export const settingsGet = () => invoke<Settings>("settings_get");
export const settingsSet = (patch: SettingsPatch) =>
  invoke<Settings>("settings_set", { patch });

export const historyQuery = (q?: string, limit?: number) =>
  invoke<HistoryEntry[]>("history_query", { q: q ?? null, limit: limit ?? 100 });
export const historyDelete = (id: number) => invoke<boolean>("history_delete", { id });
export const historyClear = () => invoke<number>("history_clear");

export const clearBrowsingData = (kinds: string[]) =>
  invoke<number>("clear_browsing_data", { kinds });

export const historyFrequent = (limit?: number) =>
  invoke<HistoryEntry[]>("history_frequent", { limit: limit ?? 8 });

export const reopenClosed = () => invoke<TabInfo | null>("reopen_closed");
export const recentlyClosedList = () => invoke<ClosedTab[]>("recently_closed_list");

export const showChromePage = (page: ChromePage | null) =>
  invoke<void>("show_chrome_page", { page });

export const bookmarksList = (q?: string) =>
  invoke<Bookmark[]>("bookmarks_list", { q: q ?? null });
export const bookmarkToggle = (url: string, title: string) =>
  invoke<Bookmark | null>("bookmark_toggle", { url, title });
export const bookmarkDelete = (id: number) => invoke<boolean>("bookmark_delete", { id });
export const bookmarkEdit = (id: number, title: string, url: string) =>
  invoke<boolean>("bookmark_edit", { id, title, url });
export const bookmarkStatus = (url: string) => invoke<boolean>("bookmark_status", { url });

export const downloadsList = (limit?: number) =>
  invoke<Download[]>("downloads_list", { limit: limit ?? 200 });
export const downloadRespond = (id: number, allow: boolean) =>
  invoke<void>("download_respond", { id, allow });
export const downloadCancel = (id: number) => invoke<void>("download_cancel", { id });
export const downloadRetry = (id: number) => invoke<void>("download_retry", { id });
export const downloadOpen = (id: number) => invoke<boolean>("download_open", { id });
export const downloadOpenConfirm = (id: number) => invoke<void>("download_open_confirm", { id });
export const downloadReveal = (id: number) => invoke<void>("download_reveal", { id });
export const downloadClear = () => invoke<number>("download_clear");

export const permissionRespond = (
  origin: string,
  kind: PermissionKind,
  decision: PermissionDecision,
) => invoke<void>("permission_respond", { origin, kind, decision });
export const permissionsList = () => invoke<SitePermission[]>("permissions_list");
export const permissionReset = (origin: string, kind: PermissionKind) =>
  invoke<void>("permission_reset", { origin, kind });
export const permissionResetAll = () => invoke<number>("permission_reset_all");

export const findStart = (id: TabId, query: string, caseSensitive: boolean) =>
  invoke<FindStatus>("find_start", { id, query, caseSensitive });
export const findNext = (id: TabId) => invoke<void>("find_next", { id });
export const findPrev = (id: TabId) => invoke<void>("find_prev", { id });
export const findClose = (id: TabId) => invoke<void>("find_close", { id });

export const tabMute = (id: TabId, muted: boolean) => invoke<void>("tab_mute", { id, muted });

export const tabDiscard = (id: TabId) => invoke<void>("tab_discard", { id });

export const tabSetVisible = (id: TabId, visible: boolean) =>
  invoke<void>("tab_set_visible", { id, visible });

/** Diagnostics for the custom titlebar/layout (layout_diag command). */
export type LayoutDiagArgs = {
  chromeTop: number;
  chromeBottom: number;
  scrollY: number;
  innerHeight: number;
  docScrollHeight: number;
}
export const layoutDiag = (args: LayoutDiagArgs) => invoke<void>("layout_diag", args);

/** Subscribes to a chrome event; returns an unlisten function. */
export const onChromeEvent = <T,>(event: string, handler: (payload: T) => void) =>
  listen<T>(event, (e) => handler(e.payload));
