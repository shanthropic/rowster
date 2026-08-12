import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { StackItem } from "@astryxdesign/core/Stack";
import { Section } from "@astryxdesign/core/Section";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import { Spinner } from "@astryxdesign/core/Spinner";
import { AppShell } from "@astryxdesign/core/AppShell";
import TitleBar from "./components/TitleBar";
import NavigationBar from "./components/NavigationBar";
import BrowserSidebar from "./components/Sidebar";
import BookmarkBar from "./components/BookmarkBar";
import StatusBar from "./components/StatusBar";
import BrowserErrorBanner from "./components/BrowserErrorBanner";
import NewTabPage from "./components/NewTabPage";
import FindBar from "./components/FindBar";
import {
  chromeLayoutChanged,
  chromeOverlayChanged,
  downloadOpenConfirm,
  downloadRespond,
  downloadsList,
  findClose,
  tabMute,
  tabDiscard,
  tabDuplicate,
  goBack,
  goForward,
  hardReload,
  navigate,
  onChromeEvent,
  EV,
  permissionRespond,
  reload,
  reopenClosed,
  runCommand,
  settingsGet,
  settingsSet,
  showChromePage,
  stop,
  tabActivate,
  tabClose,
  tabCloseOthers,
  tabCloseRight,
  tabCreate,
  tabReorder,
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

const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const HistoryPage = lazy(() => import("./pages/HistoryPage"));
const BookmarksPage = lazy(() => import("./pages/BookmarksPage"));
const DownloadsPage = lazy(() => import("./pages/DownloadsPage"));

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const sidebarWidthRef = useRef(0);

  const sendLayout = useCallback(() => {
    const chrome = document.getElementById("rowster-chrome");
    if (!chrome) return;
    const chromeRect = chrome.getBoundingClientRect();
    let bottom = 0;
    if (statusbarVisible) {
      const statusbar = document.getElementById("rowster-statusbar");
      if (statusbar) bottom = Math.ceil(statusbar.getBoundingClientRect().height);
    }
    runCommand(
      "Update browser layout",
      chromeLayoutChanged({
        top: Math.round(chromeRect.bottom),
        bottom,
        left: Math.round(sidebarWidthRef.current),
        right: 0,
      })
    );
  }, [statusbarVisible]);

  const handleSidebarWidthChange = useCallback(
    (width: number) => {
      sidebarWidthRef.current = width;
      sendLayout();
    },
    [sendLayout]
  );

  // Report the measured chrome height and status-bar height so Rust can lay
  // out the tab webviews between them.
  useEffect(() => {
    sendLayout();
    const observer = new ResizeObserver(sendLayout);
    const chrome = document.getElementById("rowster-chrome");
    if (chrome) observer.observe(chrome);
    const statusbar = document.getElementById("rowster-statusbar");
    if (statusbar) observer.observe(statusbar);
    window.addEventListener("resize", sendLayout);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", sendLayout);
    };
  }, [sendLayout]);

  // Track whether any download is active (drives the status bar + layout).
  useEffect(() => {
    const refreshActive = () => {
      runCommand(
        "Refresh downloads",
        downloadsList(50).then((list) => {
          const active = list.some((d) => d.status === "active");
          setStatusbarVisible(active);
        })
      );
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

  useEffect(() => {
    const onToggle = () => {
      requestAnimationFrame(() => {
        setPopoverOpen(document.querySelectorAll("[popover]:popover-open").length > 0);
      });
    };
    document.addEventListener("toggle", onToggle, true);
    return () => document.removeEventListener("toggle", onToggle, true);
  }, []);

  const hasModal = pendingDownload !== null || openConfirm !== null || pendingPermission !== null;
  useEffect(() => {
    runCommand("Update chrome overlay", chromeOverlayChanged(hasModal || popoverOpen));
  }, [hasModal, popoverOpen]);

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

      const key = e.key.toLowerCase();
      if (mod && e.shiftKey && key === "t") {
        e.preventDefault();
        runCommand("Reopen closed tab", reopenClosed());
      } else if (mod && e.shiftKey && key === "r" && !inField) {
        e.preventDefault();
        if (activeId !== null) runCommand("Hard reload", hardReload(activeId));
      } else if (mod && e.shiftKey && key === "o") {
        e.preventDefault();
        runCommand("Open bookmarks", showChromePage("bookmarks"));
      } else if (mod && key === "t") {
        e.preventDefault();
        runCommand("Create tab", tabCreate());
      } else if (mod && key === "f") {
        e.preventDefault();
        setFindOpen(true);
      } else if (mod && key === "w") {
        e.preventDefault();
        if (activeId !== null) runCommand("Close tab", tabClose(activeId));
      } else if (mod && key === "l") {
        e.preventDefault();
        focusAddress();
      } else if (mod && key === "r" && !inField) {
        e.preventDefault();
        if (activeId !== null) runCommand("Reload", reload(activeId));
      } else if (mod && key === "h" && !inField) {
        e.preventDefault();
        runCommand("Open history", showChromePage("history"));
      } else if (mod && key === "j") {
        e.preventDefault();
        runCommand("Open downloads", showChromePage("downloads"));
      } else if (mod && key === "b") {
        e.preventDefault();
        runCommand("Toggle bookmark bar", (async () => {
          const settings = await settingsGet();
          await settingsSet({ show_bookmark_bar: !settings.show_bookmark_bar });
        })());
      } else if (mod && e.key === "," && !inField) {
        e.preventDefault();
        runCommand("Open settings", showChromePage("settings"));
      } else if (mod && e.key === "0" && !inField) {
        e.preventDefault();
        if (activeId !== null) runCommand("Reset zoom", zoomReset(activeId));
      } else if (mod && (e.key === "=" || e.key === "+") && !inField) {
        e.preventDefault();
        if (activeId !== null) runCommand("Zoom in", zoomIn(activeId));
      } else if (mod && e.key === "-" && !inField) {
        e.preventDefault();
        if (activeId !== null) runCommand("Zoom out", zoomOut(activeId));
      } else if (e.altKey && e.key === "ArrowLeft" && activeId !== null) {
        e.preventDefault();
        runCommand("Go back", goBack(activeId));
      } else if (e.altKey && e.key === "ArrowRight" && activeId !== null) {
        e.preventDefault();
        runCommand("Go forward", goForward(activeId));
      } else if (e.key === "F5") {
        e.preventDefault();
        if (activeId !== null) runCommand("Reload", reload(activeId));
      } else if (e.key === "Escape") {
        if (activeTab?.loading && activeId !== null) runCommand("Stop loading", stop(activeId));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId, activeTab?.loading, focusAddress]);

  const handleNavigate = useCallback(
    (address: string) => {
      if (activeId === null) return;
      runCommand("Navigate", navigate(activeId, address));
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
    runCommand(
      "Respond to permission",
      permissionRespond(origin, kind, decision).then(() => {
        if (decision === "allow_once" || decision === "always_allow") {
          return reload(tab_id);
        }
      })
    );
    setPendingPermission(null);
  };

  // Find state is per-tab: close the bar when the active tab changes.
  useEffect(() => {
    setFindOpen(false);
  }, [activeId]);

  const closeFind = useCallback(() => {
    setFindOpen(false);
    if (activeId !== null) runCommand("Close find", findClose(activeId));
  }, [activeId]);

  return (
    <AppShell
      height="fill"
      variant="section"
      contentPadding={0}
      mobileNav={false}
      sideNav={
        <BrowserSidebar
          isOpen={sidebarOpen}
          activePage={activeTab?.chrome_page ?? null}
          onWidthChange={handleSidebarWidthChange}
          onNewTab={() => runCommand("Create tab", tabCreate())}
          onReopenClosed={() => runCommand("Reopen closed tab", reopenClosed())}
          onFind={() => setFindOpen(true)}
          onShowPage={(page) => runCommand("Open browser page", showChromePage(page))}
        />
      }
    >
      <VStack gap={0} style={{ height: "100%", minWidth: 0, flex: 1 }}>
        <Section
          id="rowster-chrome"
          variant="transparent"
          padding={0}
          dividers={["bottom"]}
        >
          <VStack gap={0}>
            <TitleBar
              isSidebarOpen={sidebarOpen}
              onToggleSidebar={() => setSidebarOpen((open) => !open)}
              tabs={tabs}
              activeId={activeId}
              onActivate={(id) => runCommand("Activate tab", tabActivate(id))}
              onClose={(id) => runCommand("Close tab", tabClose(id))}
              onNewTab={() => runCommand("Create tab", tabCreate())}
              onReload={(id) => runCommand("Reload tab", reload(id))}
              onCloseOthers={(id) => runCommand("Close other tabs", tabCloseOthers(id))}
              onCloseToRight={(id) => runCommand("Close tabs to the right", tabCloseRight(id))}
              onToggleMute={(id) => {
                const tab = tabs.find((t) => t.id === id);
                if (tab) runCommand("Toggle tab audio", tabMute(id, !tab.muted));
              }}
              onDiscard={(id) => runCommand("Discard tab", tabDiscard(id))}
              onDuplicate={(id) => runCommand("Duplicate tab", tabDuplicate(id))}
              onReorder={(id, beforeId) =>
                runCommand("Reorder tab", tabReorder(id, beforeId))
              }
            />
            <NavigationBar
              tab={activeTab}
              onNavigate={handleNavigate}
              onBack={(id) => runCommand("Go back", goBack(id))}
              onForward={(id) => runCommand("Go forward", goForward(id))}
              onReload={(id) => runCommand("Reload", reload(id))}
              onStop={(id) => runCommand("Stop loading", stop(id))}
              onZoomIn={(id) => runCommand("Zoom in", zoomIn(id))}
              onZoomOut={(id) => runCommand("Zoom out", zoomOut(id))}
              onZoomReset={(id) => runCommand("Reset zoom", zoomReset(id))}
              onHardReload={(id) => runCommand("Hard reload", hardReload(id))}
              onNewTab={() => runCommand("Create tab", tabCreate())}
              onReopenClosed={() => runCommand("Reopen closed tab", reopenClosed())}
              onFind={() => setFindOpen(true)}
              onShowPage={(page) => runCommand("Open browser page", showChromePage(page))}
            />
            <BookmarkBar
              activeId={activeId}
              onNavigate={(id, address) => runCommand("Navigate", navigate(id, address))}
            />
            {findOpen && activeId !== null ? (
              <FindBar tabId={activeId} onClose={closeFind} />
            ) : null}
          </VStack>
        </Section>
        <StackItem size="fill" style={{ position: "relative", minHeight: 0 }}>
          <Suspense
            fallback={
              <HStack align="center" justify="center" style={{ height: "100%" }}>
                <Spinner size="md" aria-label="Loading browser page" />
              </HStack>
            }
          >
            {activeTab?.chrome_page === "settings" ? (
              <SettingsPage onClose={() => runCommand("Close settings", showChromePage(null))} />
            ) : activeTab?.chrome_page === "history" ? (
              <HistoryPage
                onClose={() => runCommand("Close history", showChromePage(null))}
                onNavigate={handleNavigate}
              />
            ) : activeTab?.chrome_page === "bookmarks" ? (
              <BookmarksPage
                onClose={() => runCommand("Close bookmarks", showChromePage(null))}
                onNavigate={handleNavigate}
              />
            ) : activeTab?.chrome_page === "downloads" ? (
              <DownloadsPage onClose={() => runCommand("Close downloads", showChromePage(null))} />
            ) : activeTab?.is_new ? (
              <NewTabPage onNavigate={handleNavigate} />
            ) : null}
          </Suspense>
        </StackItem>
        <StatusBar
          visible={statusbarVisible}
          onOpenDownloads={() => runCommand("Open downloads", showChromePage("downloads"))}
        />
        <BrowserErrorBanner />

        {pendingDownload ? (
        <AlertDialog
          isOpen
          onOpenChange={(open) => {
            if (!open && pendingDownload) {
              runCommand("Block download", downloadRespond(pendingDownload.id, false));
              setPendingDownload(null);
            }
          }}
          title={`Download from ${downloadHost}?`}
          description={`${pendingDownload.filename} — Rowster is asking before starting this download.`}
          actionLabel="Allow"
          onAction={() => {
            runCommand("Allow download", downloadRespond(pendingDownload.id, true));
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
            runCommand("Open executable", downloadOpenConfirm(openConfirm.id));
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
    </AppShell>
  );
}
