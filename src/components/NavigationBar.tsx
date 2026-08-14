import {
  ArrowLeft,
  ArrowRight,
  History,
  Home,
  MoreVertical,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RotateCw,
  Settings,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import type { TabId, TabInfo } from "../types";
import AddressBar from "./AddressBar";
import { WindowControls } from "./TitleBar";

export interface NavigationBarProps {
  tab: TabInfo | null;
  isBlended?: boolean;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  onNavigate: (address: string) => void;
  onBack: (id: TabId) => void;
  onForward: (id: TabId) => void;
  onReload: (id: TabId) => void;
  onStop: (id: TabId) => void;
  onHome?: () => void;
  onZoomIn: (id: TabId) => void;
  onZoomOut: (id: TabId) => void;
  onNewTab?: () => void;
  onCloseTab?: (id: TabId) => void;
  onOpenHistory?: () => void;
  onOpenSettings?: () => void;
  isRightSidebarOpen: boolean;
  onToggleRightSidebar: () => void;
}

/** Navigation controls + right sidebar toggle (+ WindowControls in blended sidebar mode). */
export default function NavigationBar({
  tab,
  isBlended = false,
  isSidebarOpen = false,
  onToggleSidebar,
  onNavigate,
  onBack,
  onForward,
  onReload,
  onStop,
  onHome,
  onZoomIn,
  onZoomOut,
  onNewTab,
  onCloseTab,
  onOpenHistory,
  onOpenSettings,
  isRightSidebarOpen,
  onToggleRightSidebar,
}: NavigationBarProps) {
  const id = tab?.id ?? null;

  return (
    <Section variant="transparent" padding={1} data-tauri-drag-region={isBlended ? "" : undefined}>
      <HStack
        gap={1}
        align="center"
        style={{
          minWidth: 0,
          height: isBlended ? "var(--spacing-10)" : "auto",
        }}
        data-tauri-drag-region={isBlended ? "" : undefined}
      >
        {isBlended && !isSidebarOpen && onToggleSidebar ? (
          <IconButton
            size="sm"
            variant="ghost"
            label="Open sidebar"
            icon={<PanelLeftOpen size={16} />}
            onClick={onToggleSidebar}
            tooltip="Open sidebar"
          />
        ) : null}
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
          <IconButton
            size="sm"
            variant="ghost"
            label="Home"
            icon={<Home size={16} />}
            isDisabled={!tab}
            onClick={onHome}
            tooltip="Home (Alt+Home)"
          />
        </HStack>
        <HStack gap={0} style={{ minWidth: 0, flex: 1 }}>
          <AddressBar tab={tab} onNavigate={onNavigate} />
        </HStack>

        {/* In Sidebar Tabs Mode: Close Tab, New Tab, Divider, History, Settings buttons */}
        {isBlended && (
          <HStack gap={0} align="center">
            {onCloseTab && (
              <IconButton
                size="sm"
                variant="ghost"
                label="Close tab"
                icon={<X size={16} />}
                isDisabled={id === null}
                onClick={() => id !== null && onCloseTab(id)}
                tooltip="Close tab (Ctrl+W)"
              />
            )}
            {onNewTab && (
              <IconButton
                size="sm"
                variant="ghost"
                label="New tab"
                icon={<Plus size={16} />}
                onClick={onNewTab}
                tooltip="New tab (Ctrl+T)"
              />
            )}
            <HStack
              aria-hidden="true"
              style={{
                width: "1px",
                height: "var(--spacing-4)",
                background: "var(--color-border)",
                marginInline: "var(--spacing-1-5)",
              }}
            />
            {onOpenHistory && (
              <IconButton
                size="sm"
                variant="ghost"
                label="History"
                icon={<History size={16} />}
                onClick={onOpenHistory}
                tooltip="History (Ctrl+H)"
              />
            )}
            {onOpenSettings && (
              <IconButton
                size="sm"
                variant="ghost"
                label="Settings"
                icon={<Settings size={16} />}
                onClick={onOpenSettings}
                tooltip="Settings (Ctrl+,)"
              />
            )}
          </HStack>
        )}

        <HStack gap={0} align="center" className="browser-zoom-controls">
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
        </HStack>

        {/* Right Sidebar toggle button: 3 dots when in sidebar tab mode, panel icon otherwise */}
        <IconButton
          size="sm"
          variant="ghost"
          label={
            isBlended
              ? isRightSidebarOpen
                ? "Close menu"
                : "Menu"
              : isRightSidebarOpen
                ? "Close sidebar"
                : "Open sidebar"
          }
          icon={
            isBlended ? (
              <MoreVertical size={16} />
            ) : isRightSidebarOpen ? (
              <PanelRightClose size={16} />
            ) : (
              <PanelRightOpen size={16} />
            )
          }
          onClick={onToggleRightSidebar}
          tooltip={
            isBlended
              ? isRightSidebarOpen
                ? "Close menu"
                : "Menu"
              : isRightSidebarOpen
                ? "Close sidebar"
                : "Open sidebar"
          }
        />
        {isBlended && <WindowControls />}
      </HStack>
    </Section>
  );
}
