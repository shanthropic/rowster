import { useCallback, useEffect, useRef, useState } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { StackItem } from "@astryxdesign/core/Stack";
import { Section } from "@astryxdesign/core/Section";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import TitleBar from "./components/TitleBar";
import BrowserToolbar from "./components/Toolbar";
import BookmarkBar from "./components/BookmarkBar";
import StatusBar from "./components/StatusBar";
import NewTabPage from "./components/NewTabPage";
import FindBar from "./components/FindBar";
import SettingsPage from "./pages/SettingsPage";
import HistoryPage from "./pages/HistoryPage";
import BookmarksPage from "./pages/BookmarksPage";
import DownloadsPage from "./pages/DownloadsPage";
import {
  chromeLayoutChanged,
  downloadOpenConfirm,
  downloadRespond,
  downloadsList,
  findClose,
  tabMute,
  tabDiscard,
  goBack,
  goForward,
  hardReload,
  layoutDiag,
  navigate,
  onChromeEvent,
  EV,
  permissionRespond,
  reload,
  reopenClosed,
  settingsGet,
  settingsSet,
  showChromePage,
  stop,
  tabActivate,
  tabClose,
  tabCreate,
  tabSetVisible,
  zoomIn,
  zoomOut,
  zoomReset,
} from "./ipc";
import type {
  DownloadOpenConfirm,
  DownloadRequested,
  PermissionRequested,
  PermissionDecision,
} from "./types";
import { activeTabOf, useBrowserState } from "./state";

export default function App() {
  const state = useBrowserState();
  const activeTab = activeTabOf(state);
  const activeId = activeTab?.id ?? null;
  const tabs = state.windows[0]?.tabs ?? [];
const [pendingDownload, setPendingDownload] = useState<DownloadRequested | null>(null);
const [openConfirm, setOpenConfirm] = useState<DownloadOpenConfirm | null>(null);
const [pendingPermission, setPendingPermission] = useState<PermissionRequested | null>(null);
const [statusbarVisible, setStatusbarVisible] = useState(false);
const [findOpen, setFindOpen] = useState(false);

  // Report the measured chrome height and status-bar height so Rust can lay
  // out the tab webviews between them.
  useEffect(() => {
    const send = () => {
      const chrome = document.getElementById("rowster-chrome");
      if (!chrome) return;
      const chromeRect = chrome.getBoundingClientRect();
      let bottom = 0;
      if (statusbarVisible) {
        const statusbar = document.getElementById("rowster-statusbar");
        if (statusbar) bottom = Math.ceil(statusbar.getBoundingClientRect().height);
      }
      console.log("[layout] chrome rect", {
        top: chromeRect.top,
        bottom: chromeRect.bottom,
        height: chromeRect.height,
        scrollY: window.scrollY,
        innerHeight: window.innerHeight,
        docScrollHeight: document.documentElement.scrollHeight,
      });
      void layoutDiag({
        chromeTop: chromeRect.top,
        chromeBottom: chromeRect.bottom,
        scrollY: window.scrollY,
        innerHeight: window.innerHeight,
        docScrollHeight: document.documentElement.scrollHeight,
      });
      void chromeLayoutChanged({
        top: Math.round(chromeRect.bottom),
        bottom,
        left: 0,
        right: 0,
      });
    };
    send();
    const observer = new ResizeObserver(send);
    const chrome = document.getElementById("rowster-chrome");
    if (chrome) observer.observe(chrome);
    const statusbar = document.getElementById("rowster-statusbar");
    if (statusbar) observer.observe(statusbar);
    window.addEventListener("resize", send);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", send);
    };
  }, [statusbarVisible]);

  // Track whether any download is active (drives the status bar + layout).
  useEffect(() => {
    const refreshActive = () => {
      void downloadsList(50).then((list) => {
        const active = list.some((d) => d.status === "active");
        setStatusbarVisible(active);
      });
    };
    void refreshActive();
    const events = [
      EV.DOWNLOAD_STARTED,
      EV.DOWNLOAD_COMPLETED,
      EV.DOWNLOAD_FAILED,
      EV.DOWNLOAD_CANCELLED,
    ];
    const unlisteners = events.map((event) =>
      onChromeEvent<unknown>(event, refreshActive)
    );
    return () => {
      for (const unlisten of unlisteners) void unlisten.then((fn) => fn());
    };
  }, []);

  // Download prompts and executable-open confirmations.
  useEffect(() => {
    const unlistenPrompt = onChromeEvent<DownloadRequested>(
      EV.DOWNLOAD_REQUESTED,
      setPendingDownload
    );
    const unlistenConfirm = onChromeEvent<DownloadOpenConfirm>(
      EV.DOWNLOAD_OPEN_CONFIRM,
      setOpenConfirm
    );
    const unlistenPermission = onChromeEvent<PermissionRequested>(
      EV.PERMISSION_REQUESTED,
      setPendingPermission
    );
    return () => {
      void unlistenPrompt.then((fn) => fn());
      void unlistenConfirm.then((fn) => fn());
      void unlistenPermission.then((fn) => fn());
    };
  }, []);

  const focusAddress = useCallback(() => {
    window.dispatchEvent(new CustomEvent("rowster:focus-address"));
  }, []);

  // Keyboard shortcuts (window-level; inputs stop propagation where needed).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === "t") {
        e.preventDefault();
        void tabCreate();
      } else if (mod && e.key.toLowerCase() === "f" && !inField) {
        e.preventDefault();
        setFindOpen(true);
      } else if (mod && e.key.toLowerCase() === "w") {
        e.preventDefault();
        if (activeId !== null) void tabClose(activeId);
      } else if (mod && e.key.toLowerCase() === "l" && !inField) {
        e.preventDefault();
        focusAddress();
      } else if (mod && e.key.toLowerCase() === "r" && !inField) {
        e.preventDefault();
        if (activeId !== null) void reload(activeId);
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "r" && !inField) {
        e.preventDefault();
        if (activeId !== null) void hardReload(activeId);
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        void reopenClosed();
      } else if (mod && e.key.toLowerCase() === "h" && !inField) {
        e.preventDefault();
        void showChromePage("history");
      } else if (mod && e.key.toLowerCase() === "j") {
        e.preventDefault();
        void showChromePage("downloads");
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void showChromePage("bookmarks");
      } else if (mod && e.key.toLowerCase() === "b") {
        e.preventDefault();
        void (async () => {
          const settings = await settingsGet();
          await settingsSet({ show_bookmark_bar: !settings.show_bookmark_bar });
        })();
      } else if (mod && e.key === "," && !inField) {
        e.preventDefault();
        void showChromePage("settings");
      } else if (mod && e.key === "0" && !inField) {
        e.preventDefault();
        if (activeId !== null) void zoomReset(activeId);
      } else if (mod && (e.key === "=" || e.key === "+") && !inField) {
        e.preventDefault();
        if (activeId !== null) void zoomIn(activeId);
      } else if (mod && e.key === "-" && !inField) {
        e.preventDefault();
        if (activeId !== null) void zoomOut(activeId);
      } else if (e.key === "F5") {
        e.preventDefault();
        if (activeId !== null) void reload(activeId);
      } else if (e.key === "Escape") {
        if (activeTab?.loading && activeId !== null) void stop(activeId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId, activeTab?.loading, focusAddress]);

  const handleNavigate = useCallback(
    (address: string) => {
      if (activeId === null) return;
      void navigate(activeId, address);
    },
    [activeId]
  );

  const downloadHost = pendingDownload
    ? (() => {
        try {
          return new URL(pendingDownload.url).host || pendingDownload.url;
        } catch {
          return pendingDownload.url;
        }
      })()
    : "";

  const permissionKindLabel =
    pendingPermission?.kind === "camera"
      ? "Camera"
      : pendingPermission?.kind === "microphone"
        ? "Microphone"
        : pendingPermission?.kind === "geolocation"
          ? "Location"
          : "Notifications";

  const respondPermission = (decision: PermissionDecision) => {
    if (!pendingPermission) return;
    const { origin, kind, tab_id } = pendingPermission;
    void permissionRespond(origin, kind, decision);
    if (decision === "allow_once" || decision === "always_allow") {
      void reload(tab_id);
    }
    setPendingPermission(null);
  };

  // Find state is per-tab: close the bar when the active tab changes.
  useEffect(() => {
    setFindOpen(false);
  }, [activeId]);

  // --- Chrome overlay visibility ------------------------------------------------
  // Tauri child webviews (tab webviews) always render on top of the main
  // webview at the OS level.  When a chrome overlay (MoreMenu popover,
  // FindBar) is open, hide the active tab webview so it doesn't paint on
  // top of the chrome UI.  When the overlay closes, show it again.
  const findOpenRef = useRef(findOpen);
  findOpenRef.current = findOpen;

  useEffect(() => {
    if (activeId === null) return;
    const hasOpenPopovers = () =>
      document.querySelectorAll("[popover]:popover-open").length > 0;
    const handleToggle = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!target.matches?.("[popover]")) return;
      requestAnimationFrame(() => {
        const hide = findOpenRef.current || hasOpenPopovers();
        void tabSetVisible(activeId, !hide);
      });
    };
    document.addEventListener("toggle", handleToggle, true);
    return () => document.removeEventListener("toggle", handleToggle, true);
  }, [activeId]);

  useEffect(() => {
    if (activeId === null) return;
    const hide =
      findOpen ||
      document.querySelectorAll("[popover]:popover-open").length > 0;
    void tabSetVisible(activeId, !hide);
  }, [findOpen, activeId]);

  const closeFind = useCallback(() => {
    setFindOpen(false);
    if (activeId !== null) void findClose(activeId);
  }, [activeId]);

  return (
    <VStack gap={0} style={{ height: "100%" }}>
      <Section
        id="rowster-chrome"
        variant="transparent"
        padding={0}
        dividers={["bottom"]}
      >
        <VStack gap={0}>
          <TitleBar
            tabs={tabs}
            activeId={activeId}
            onActivate={(id) => void tabActivate(id)}
            onClose={(id) => void tabClose(id)}
            onNewTab={() => void tabCreate()}
            onReload={(id) => void reload(id)}
            onCloseOthers={(id) => {
              for (const tab of tabs) {
                if (tab.id !== id) void tabClose(tab.id);
              }
            }}
            onCloseToRight={(id) => {
              const idx = tabs.findIndex((t) => t.id === id);
              for (const tab of tabs.slice(idx + 1)) void tabClose(tab.id);
            }}
            onToggleMute={(id) => {
              const tab = tabs.find((t) => t.id === id);
              if (tab) void tabMute(id, !tab.muted);
            }}
            onDiscard={(id) => void tabDiscard(id)}
          />
          <BrowserToolbar
            tab={activeTab}
            onNavigate={handleNavigate}
            onBack={(id) => void goBack(id)}
            onForward={(id) => void goForward(id)}
            onReload={(id) => void reload(id)}
            onHardReload={(id) => void hardReload(id)}
            onStop={(id) => void stop(id)}
            onNewTab={() => void tabCreate()}
            onZoomIn={(id) => void zoomIn(id)}
            onZoomOut={(id) => void zoomOut(id)}
            onZoomReset={(id) => void zoomReset(id)}
            onShowHistory={() => void showChromePage("history")}
            onShowSettings={() => void showChromePage("settings")}
            onShowBookmarks={() => void showChromePage("bookmarks")}
            onShowDownloads={() => void showChromePage("downloads")}
            onReopenClosed={() => void reopenClosed()}
          />
          <BookmarkBar
            activeId={activeId}
            onNavigate={(id, address) => void navigate(id, address)}
          />
        </VStack>
      </Section>
      <StackItem size="fill" style={{ position: "relative", minHeight: 0 }}>
        {activeTab?.chrome_page === "settings" ? (
          <SettingsPage onClose={() => void showChromePage(null)} />
        ) : activeTab?.chrome_page === "history" ? (
          <HistoryPage
            onClose={() => void showChromePage(null)}
            onNavigate={handleNavigate}
          />
        ) : activeTab?.chrome_page === "bookmarks" ? (
          <BookmarksPage
            onClose={() => void showChromePage(null)}
            onNavigate={handleNavigate}
          />
        ) : activeTab?.chrome_page === "downloads" ? (
          <DownloadsPage onClose={() => void showChromePage(null)} />
        ) : activeTab?.is_new ? (
          <NewTabPage onNavigate={handleNavigate} />
        ) : null}
        {findOpen && activeId !== null ? (
          <FindBar tabId={activeId} onClose={closeFind} />
        ) : null}
      </StackItem>
      <StatusBar
        visible={statusbarVisible}
        onOpenDownloads={() => void showChromePage("downloads")}
      />

      {pendingDownload ? (
        <AlertDialog
          isOpen
          onOpenChange={(open) => {
            if (!open && pendingDownload) {
              void downloadRespond(pendingDownload.id, false);
              setPendingDownload(null);
            }
          }}
          title={`Download from ${downloadHost}?`}
          description={`${pendingDownload.filename} — Rowster is asking before starting this download.`}
          actionLabel="Allow"
          onAction={() => {
            void downloadRespond(pendingDownload.id, true);
            setPendingDownload(null);
          }}
          cancelLabel="Block"
        />
      ) : null}

      {openConfirm ? (
        <AlertDialog
          isOpen
          onOpenChange={(open) => {
            if (!open) setOpenConfirm(null);
          }}
          title="Open executable file?"
          description={`${openConfirm.filename} is an executable. Opening it may run code on your computer.`}
          actionLabel="Open"
          onAction={() => {
            void downloadOpenConfirm(openConfirm.id);
            setOpenConfirm(null);
          }}
          cancelLabel="Cancel"
        />
      ) : null}

      {pendingPermission ? (
        <Dialog
          isOpen
          onOpenChange={(open) => {
            if (!open) setPendingPermission(null);
          }}
        >
          <DialogHeader
            title={`Allow ${permissionKindLabel.toLowerCase()} access?`}
            subtitle={pendingPermission.origin}
            onOpenChange={(open) => {
              if (!open) setPendingPermission(null);
            }}
          />
          <VStack gap={4} padding={4}>
            <Text type="body" color="secondary">
              {pendingPermission.origin} is requesting access to the{" "}
              {permissionKindLabel.toLowerCase()}. You can allow it just this
              once, remember your choice for this site, or block it.
            </Text>
            <HStack gap={2} justify="end" style={{ marginTop: "var(--spacing-3)" }}>
              <Button label="Block" variant="secondary" onClick={() => respondPermission("block")} />
              <Button
                label="Allow once"
                variant="secondary"
                onClick={() => respondPermission("allow_once")}
              />
              <Button
                label="Always allow"
                variant="primary"
                onClick={() => respondPermission("always_allow")}
              />
            </HStack>
          </VStack>
        </Dialog>
      ) : null}
    </VStack>
  );
}
