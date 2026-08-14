import { useCallback, useEffect, useRef, useState } from "react";
import { PanelLeftClose } from "lucide-react";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";
import TabStrip, { type TabStripProps } from "./TabStrip";
import type { TabLayout } from "../types";

const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 500;
const DEFAULT_SIDEBAR_WIDTH = 260;
const STORAGE_KEY = "rowster:sidebar-width";

export interface BrowserSidebarProps extends TabStripProps {
  isOpen: boolean;
  tabLayout: TabLayout;
  onWidthChange: (width: number) => void;
  onToggleSidebar: () => void;
}

export default function BrowserSidebar({
  isOpen,
  tabLayout,
  onWidthChange,
  onToggleSidebar,
  ...tabStripProps
}: BrowserSidebarProps) {
  const containerRef = useRef<HTMLElement | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? Number.parseInt(saved, 10) : NaN;
    return Number.isFinite(parsed) && parsed >= MIN_SIDEBAR_WIDTH && parsed <= MAX_SIDEBAR_WIDTH
      ? parsed
      : DEFAULT_SIDEBAR_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const [isHandleHovered, setIsHandleHovered] = useState(false);

  const isVertical = tabLayout === "vertical";

  useEffect(() => {
    if (!isVertical) {
      onWidthChange(0);
      return;
    }
    const container = containerRef.current;
    if (!container) return;

    const reportWidth = () => {
      onWidthChange(container.getBoundingClientRect().width);
    };
    reportWidth();

    const observer = new ResizeObserver(reportWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, [isVertical, onWidthChange]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextWidth = Math.min(
        MAX_SIDEBAR_WIDTH,
        Math.max(MIN_SIDEBAR_WIDTH, Math.round(startWidth + delta))
      );
      setSidebarWidth(nextWidth);
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      const delta = upEvent.clientX - startX;
      const finalWidth = Math.min(
        MAX_SIDEBAR_WIDTH,
        Math.max(MIN_SIDEBAR_WIDTH, Math.round(startWidth + delta))
      );
      setSidebarWidth(finalWidth);
      try {
        localStorage.setItem(STORAGE_KEY, String(finalWidth));
      } catch {
        // ignore localStorage errors
      }
      setIsResizing(false);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }, [sidebarWidth]);

  if (!isVertical) {
    return null;
  }

  return (
    <HStack
      ref={containerRef}
      aria-hidden={!isOpen}
      gap={0}
      style={{
        position: "relative",
        width: isOpen ? `${sidebarWidth}px` : "var(--spacing-0)",
        minWidth: isOpen ? `${sidebarWidth}px` : "var(--spacing-0)",
        height: "100%",
        overflow: "hidden",
        flex: "none",
        background: "var(--color-background-surface)",
        borderInlineEnd: isOpen
          ? "var(--border-width) solid var(--color-border)"
          : "var(--spacing-0) solid transparent",
        transition: isResizing
          ? "none"
          : "width var(--duration-medium) var(--ease-standard), min-width var(--duration-medium) var(--ease-standard)",
      }}
    >
      {isOpen ? (
        <VStack
          gap={0}
          style={{
            width: `${sidebarWidth}px`,
            height: "100%",
            overflow: "hidden",
          }}
        >
          {/* Sidebar Header: blends at top with actionbar */}
          <HStack
            gap={1}
            align="center"
            justify="between"
            paddingInline={2}
            style={{
              height: "var(--spacing-10)",
              flex: "none",
              borderBottom: "var(--border-width) solid var(--color-border-subtle)",
            }}
            data-tauri-drag-region
          >
            <Text type="label" className="browser-wordmark">
              ROWSTER
            </Text>
            <IconButton
              size="sm"
              variant="ghost"
              label="Collapse sidebar"
              icon={<PanelLeftClose size={16} />}
              onClick={onToggleSidebar}
              tooltip="Collapse sidebar"
            />
          </HStack>
          {/* Vertical Tabs Strip */}
          <TabStrip
            {...tabStripProps}
            orientation="vertical"
            showNewTabButton={false}
          />
        </VStack>
      ) : null}

      {/* Resize Handle */}
      {isOpen && (
        <HStack
          aria-hidden="true"
          onPointerDown={handlePointerDown}
          onMouseEnter={() => setIsHandleHovered(true)}
          onMouseLeave={() => setIsHandleHovered(false)}
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: "4px",
            cursor: "col-resize",
            zIndex: 10,
            background: isResizing || isHandleHovered
              ? "var(--color-accent-base)"
              : "transparent",
            transition: "background var(--duration-fast) var(--ease-standard)",
          }}
        />
      )}
    </HStack>
  );
}
