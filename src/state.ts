import { useSyncExternalStore } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
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
  isReady: boolean;
}

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

const initialState: BrowserState = { windows: [], isReady: false };
let state = initialState;
let startPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function patchTab(
  windows: BrowserWindowInfo[],
  id: TabId,
  patch: Partial<TabInfo>
): BrowserWindowInfo[] {
  return windows.map((window) => {
    if (!window.tabs.some((tab) => tab.id === id)) return window;
    return {
      ...window,
      tabs: window.tabs.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)),
    };
  });
}

function reduce(current: BrowserState, action: Action): BrowserState {
  switch (action.type) {
    case "snapshot":
      return { windows: action.snapshot.windows, isReady: true };
    case "created": {
      if (current.windows.some((window) => window.tabs.some((tab) => tab.id === action.tab.id))) {
        return { ...current, windows: patchTab(current.windows, action.tab.id, action.tab) };
      }
      const [first, ...rest] = current.windows;
      if (!first) return current;
      return {
        ...current,
        windows: [{ ...first, tabs: [...first.tabs, action.tab] }, ...rest],
      };
    }
    case "closed":
      return {
        ...current,
        windows: current.windows.map((window) =>
          window.tabs.some((tab) => tab.id === action.id)
            ? {
                ...window,
                active_tab_id:
                  window.active_tab_id === action.id ? null : window.active_tab_id,
                tabs: window.tabs.filter((tab) => tab.id !== action.id),
              }
            : window
        ),
      };
    case "activated":
      return {
        ...current,
        windows: current.windows.map((window) =>
          window.tabs.some((tab) => tab.id === action.id)
            ? {
                ...window,
                active_tab_id: action.id,
                tabs: window.tabs.map((tab) => ({
                  ...tab,
                  is_active: tab.id === action.id,
                })),
              }
            : window
        ),
      };
    case "url":
      return { ...current, windows: patchTab(current.windows, action.payload.id, { url: action.payload.url }) };
    case "title":
      return { ...current, windows: patchTab(current.windows, action.payload.id, { title: action.payload.title }) };
    case "loading":
      return { ...current, windows: patchTab(current.windows, action.payload.id, { loading: action.payload.loading }) };
    case "nav":
      return {
        ...current,
        windows: patchTab(current.windows, action.payload.id, {
          can_go_back: action.payload.can_go_back,
          can_go_forward: action.payload.can_go_forward,
        }),
      };
    case "zoom":
      return { ...current, windows: patchTab(current.windows, action.payload.id, { zoom: action.payload.zoom }) };
    case "favicon":
      return {
        ...current,
        windows: patchTab(current.windows, action.payload.id, {
          favicon_url: action.payload.favicon_url,
        }),
      };
  }
}

function dispatch(action: Action) {
  const next = reduce(state, action);
  if (next === state) return;
  state = next;
  for (const listener of listeners) listener();
}

async function startStore() {
  const subscriptions: Promise<UnlistenFn>[] = [
    onChromeEvent<BrowserSnapshot>(EV.TABS_SNAPSHOT, (snapshot) =>
      dispatch({ type: "snapshot", snapshot })
    ),
    onChromeEvent<TabInfo>(EV.TAB_CREATED, (tab) => dispatch({ type: "created", tab })),
    onChromeEvent<IdPayload>(EV.TAB_CLOSED, ({ id }) => dispatch({ type: "closed", id })),
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

  await Promise.all(subscriptions);
  dispatch({ type: "snapshot", snapshot: await startupInfo() });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  startPromise ??= startStore().catch((error: unknown) => {
    window.dispatchEvent(new CustomEvent("rowster:command-error", { detail: String(error) }));
  });
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

export function activeTabOf(browser: BrowserState): TabInfo | null {
  const window = browser.windows[0];
  if (!window) return null;
  return (
    window.tabs.find((tab) => tab.id === window.active_tab_id) ??
    window.tabs.find((tab) => tab.is_active) ??
    null
  );
}

export function useBrowserState(): BrowserState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
