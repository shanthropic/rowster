import {
  ArrowLeft,
  ArrowRight,
  PanelRightClose,
  PanelRightOpen,
  RotateCw,
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

export interface NavigationBarProps {
  tab: TabInfo | null;
  onNavigate: (address: string) => void;
  onBack: (id: TabId) => void;
  onForward: (id: TabId) => void;
  onReload: (id: TabId) => void;
  onStop: (id: TabId) => void;
  onZoomIn: (id: TabId) => void;
  onZoomOut: (id: TabId) => void;
  isRightSidebarOpen: boolean;
  onToggleRightSidebar: () => void;
}

/** Navigation controls + right sidebar toggle. */
export default function NavigationBar({
  tab,
  onNavigate,
  onBack,
  onForward,
  onReload,
  onStop,
  onZoomIn,
  onZoomOut,
  isRightSidebarOpen,
  onToggleRightSidebar,
}: NavigationBarProps) {
  const id = tab?.id ?? null;

  return (
    <Section variant="transparent" padding={1}>
      <HStack gap={1} align="center" style={{ minWidth: 0 }}>
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
        <HStack gap={0} style={{ minWidth: 0, flex: 1 }}>
          <AddressBar tab={tab} onNavigate={onNavigate} />
        </HStack>
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
        <IconButton
          size="sm"
          variant="ghost"
          label={isRightSidebarOpen ? "Close sidebar" : "Open sidebar"}
          icon={
            isRightSidebarOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />
          }
          onClick={onToggleRightSidebar}
          tooltip={isRightSidebarOpen ? "Close sidebar" : "Open sidebar"}
        />
      </HStack>
    </Section>
  );
}
