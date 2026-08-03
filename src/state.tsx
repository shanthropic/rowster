import { useEffect, useReducer } from "react";
import {
  EV,
  onChromeEvent,
  startupInfo,
  type FaviconChangedPayload,
  type IdPayload,
  type LoadingChangedPayload,
  type NavStateChangedPayload,
  type TitleChangedPayload,
  type UrlChangedPayload,
  type ZoomChangedPayload,
} from "./ipc";
import type { BrowserSnapshot, BrowserWindowInfo, TabId, TabInfo } from "./types";

export interface BrowserState {
  windows: BrowserWindowInfo[];
}

export const emptyState: BrowserState = { windows: [] };

type Action =
  | { type: "snapshot"; snapshot: BrowserSnapshot }
  | { type: "created"; tab: TabInfo }
  | { type: "closed"; id: TabId }
  | { type: "activated"; id: TabId }
  | { type: "url"; payload: UrlChangedPayload }
  | { type: "title"; payload: TitleChangedPayload }
  | { type: "loading"; payload: LoadingChangedPayload }
  | { type: "nav"; payload: NavStateChangedPayload }
  | { type: "zoom"; payload: ZoomChangedPayload }
  | { type: "favicon"; payload: FaviconChangedPayload };

function patchTab(
  window: BrowserWindowInfo,
  id: TabId,
  patch: Partial<TabInfo>
): BrowserWindowInfo {
  return {
    ...window,
    tabs: window.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  };
}

function reducer(state: BrowserState, action: Action): BrowserState {
  switch (action.type) {
    case "snapshot":
      return { windows: action.snapshot.windows };
    case "created": {
      const windows = state.windows.map((w) =>
        patchTab(w, action.tab.id, action.tab)
      );
      if (!windows.length) return state;
      const first = windows[0];
      if (!first.tabs.some((t) => t.id === action.tab.id)) {
        windows[0] = { ...first, tabs: [...first.tabs, action.tab] };
      }
      return { windows };
    }
    case "closed":
      return {
        windows: state.windows.map((w) => ({
          ...w,
          active_tab_id: w.active_tab_id === action.id ? null : w.active_tab_id,
          tabs: w.tabs.filter((t) => t.id !== action.id),
        })),
      };
    case "activated":
      return {
        windows: state.windows.map((w) => {
          if (w.active_tab_id === action.id) return w;
          return {
            ...w,
            active_tab_id: action.id,
            tabs: w.tabs.map((t) => ({ ...t, is_active: t.id === action.id })),
          };
        }),
      };
    case "url":
      return { windows: state.windows.map((w) => patchTab(w, action.payload.id, { url: action.payload.url })) };
    case "title":
      return { windows: state.windows.map((w) => patchTab(w, action.payload.id, { title: action.payload.title })) };
    case "loading":
      return { windows: state.windows.map((w) => patchTab(w, action.payload.id, { loading: action.payload.loading })) };
    case "nav":
      return { windows: state.windows.map((w) => patchTab(w, action.payload.id, { can_go_back: action.payload.can_go_back, can_go_forward: action.payload.can_go_forward })) };
    case "zoom":
      return { windows: state.windows.map((w) => patchTab(w, action.payload.id, { zoom: action.payload.zoom })) };
    case "favicon":
      return { windows: state.windows.map((w) => patchTab(w, action.payload.id, { favicon_url: action.payload.favicon_url })) };
  }
}

/** Returns the first window's active tab, or null. */
export function activeTabOf(state: BrowserState): TabInfo | null {
  const window = state.windows[0];
  if (!window) return null;
  return window.tabs.find((t) => t.is_active) ?? null;
}

/**
 * Owns the chrome's view of browser state. Bootstraps from `startup_info`
 * (the Rust side already emitted the snapshot before we subscribed) and
 * stays in sync through the event stream; snapshots are authoritative.
 */
export function useBrowserState(): BrowserState {
  const [state, dispatch] = useReducer(reducer, emptyState);

  useEffect(() => {
    let alive = true;
    void startupInfo().then((snapshot) => {
      if (alive) dispatch({ type: "snapshot", snapshot });
    });

    const unlisteners = [
      onChromeEvent<BrowserSnapshot>(EV.TABS_SNAPSHOT, (snapshot) =>
        dispatch({ type: "snapshot", snapshot })
      ),
      onChromeEvent<TabInfo>(EV.TAB_CREATED, (tab) =>
        dispatch({ type: "created", tab })
      ),
      onChromeEvent<IdPayload>(EV.TAB_CLOSED, ({ id }) =>
        dispatch({ type: "closed", id })
      ),
      onChromeEvent<IdPayload>(EV.TAB_ACTIVATED, ({ id }) =>
        dispatch({ type: "activated", id })
      ),
      onChromeEvent<UrlChangedPayload>(EV.URL_CHANGED, (payload) =>
        dispatch({ type: "url", payload })
      ),
      onChromeEvent<TitleChangedPayload>(EV.TITLE_CHANGED, (payload) =>
        dispatch({ type: "title", payload })
      ),
      onChromeEvent<LoadingChangedPayload>(EV.LOADING_CHANGED, (payload) =>
        dispatch({ type: "loading", payload })
      ),
      onChromeEvent<NavStateChangedPayload>(EV.NAV_STATE_CHANGED, (payload) =>
        dispatch({ type: "nav", payload })
      ),
      onChromeEvent<ZoomChangedPayload>(EV.ZOOM_CHANGED, (payload) =>
        dispatch({ type: "zoom", payload })
      ),
      onChromeEvent<FaviconChangedPayload>(EV.FAVICON_CHANGED, (payload) =>
        dispatch({ type: "favicon", payload })
      ),
    ];

    return () => {
      alive = false;
      for (const unlisten of unlisteners) {
        void unlisten.then((fn) => fn());
      }
    };
  }, []);

  return state;
}
