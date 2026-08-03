import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Download,
  History,
  Info,
  Plus,
  RotateCw,
  Search,
  Settings,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { IconButton } from "@astryxdesign/core/IconButton";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { Text } from "@astryxdesign/core/Text";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { HStack } from "@astryxdesign/core/HStack";
import type { TabId, TabInfo } from "../types";
import AddressBar from "./AddressBar";

export interface ToolbarProps {
  tab: TabInfo | null;
  onNavigate: (address: string) => void;
  onBack: (id: TabId) => void;
  onForward: (id: TabId) => void;
  onReload: (id: TabId) => void;
  onHardReload: (id: TabId) => void;
  onStop: (id: TabId) => void;
  onNewTab: () => void;
  onZoomIn: (id: TabId) => void;
  onZoomOut: (id: TabId) => void;
  onZoomReset: (id: TabId) => void;
  onShowHistory: () => void;
  onShowSettings: () => void;
  onShowBookmarks: () => void;
  onShowDownloads: () => void;
  onReopenClosed: () => void;
}

/** Row 2 of the chrome: navigation cluster, address bar, zoom, app menu. */
export default function BrowserToolbar({
  tab,
  onNavigate,
  onBack,
  onForward,
  onReload,
  onHardReload,
  onStop,
  onNewTab,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onShowHistory,
  onShowSettings,
  onShowBookmarks,
  onShowDownloads,
  onReopenClosed,
}: ToolbarProps) {
  const id = tab?.id ?? null;

  return (
    <Toolbar
      label="Browser toolbar"
      size="md"
      gap={1}
      startContent={
        <HStack gap={0} align="center">
          <IconButton
            size="sm"
            variant="ghost"
            label="Back"
            icon={<ArrowLeft size={16} />}
            isDisabled={!tab?.can_go_back}
            onClick={() => id !== null && onBack(id)}
            tooltip="Back (Alt+Left)"
          />
          <IconButton
            size="sm"
            variant="ghost"
            label="Forward"
            icon={<ArrowRight size={16} />}
            isDisabled={!tab?.can_go_forward}
            onClick={() => id !== null && onForward(id)}
            tooltip="Forward (Alt+Right)"
          />
          <IconButton
            size="sm"
            variant="ghost"
            label={tab?.loading ? "Stop" : "Reload"}
            icon={tab?.loading ? <X size={16} /> : <RotateCw size={16} />}
            onClick={() => {
              if (id === null) return;
              if (tab?.loading) onStop(id);
              else onReload(id);
            }}
            tooltip={tab?.loading ? "Stop (Esc)" : "Reload (Ctrl+R)"}
          />
        </HStack>
      }
      centerContent={<AddressBar tab={tab} onNavigate={onNavigate} />}
      endContent={
        <HStack gap={0} align="center">
          <IconButton
            size="sm"
            variant="ghost"
            label="Zoom out"
            icon={<ZoomOut size={16} />}
            isDisabled={!tab}
            onClick={() => id !== null && onZoomOut(id)}
            tooltip="Zoom out (Ctrl+-)"
          />
          <Text type="label" style={{ minWidth: "var(--spacing-8)" }} justify="center">
            {tab ? `${Math.round(tab.zoom * 100)}%` : "100%"}
          </Text>
          <IconButton
            size="sm"
            variant="ghost"
            label="Zoom in"
            icon={<ZoomIn size={16} />}
            isDisabled={!tab}
            onClick={() => id !== null && onZoomIn(id)}
            tooltip="Zoom in (Ctrl++)"
          />
          <MoreMenu
            size="sm"
            variant="ghost"
            label="Browser menu"
            items={[
              { label: "New Tab", icon: <Plus size={14} />, onClick: onNewTab },
              {
                label: "Hard Reload",
                icon: <RotateCw size={14} />,
                isDisabled: !tab,
                onClick: () => id !== null && onHardReload(id),
              },
              { type: "divider" },
              {
                label: "Reset Zoom",
                isDisabled: !tab || tab.zoom === 1,
                onClick: () => id !== null && onZoomReset(id),
              },
              { type: "divider" },
              {
                label: "Reopen Closed Tab",
                icon: <Undo2 size={14} />,
                onClick: onReopenClosed,
              },
              { type: "divider" },
              { label: "Find in Page", icon: <Search size={14} />, isDisabled: true },
              {
                label: "Downloads",
                icon: <Download size={14} />,
                onClick: onShowDownloads,
              },
              {
                label: "Bookmarks",
                icon: <Bookmark size={14} />,
                onClick: onShowBookmarks,
              },
              { label: "History", icon: <History size={14} />, onClick: onShowHistory },
              { label: "Settings", icon: <Settings size={14} />, onClick: onShowSettings },
              { type: "divider" },
              { label: "About Rowster", icon: <Info size={14} />, isDisabled: true },
            ]}
          />
        </HStack>
      }
    />
  );
}
