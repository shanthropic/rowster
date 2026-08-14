import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Globe, Moon, Plus, RefreshCw, Volume2, VolumeX, X } from "lucide-react";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { ContextMenu } from "@astryxdesign/core/ContextMenu";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { useListFocus } from "@astryxdesign/core/hooks";
import type { TabId, TabInfo } from "../types";

export interface TabStripProps {
  tabs: TabInfo[];
  activeId: TabId | null;
  orientation?: "horizontal" | "vertical";
  showNewTabButton?: boolean;
  onActivate: (id: TabId) => void;
  onClose: (id: TabId) => void;
  onNewTab: () => void;
  onReload: (id: TabId) => void;
  onCloseOthers: (id: TabId) => void;
  onCloseToRight: (id: TabId) => void;
  onToggleMute: (id: TabId) => void;
  onDiscard: (id: TabId) => void;
  onDuplicate: (id: TabId) => void;
  onReorder: (id: TabId, beforeId: TabId | null) => void;
}

/** Pointer movement before a pointerdown becomes a drag (CSS pixels). */
const DRAG_THRESHOLD = 5;

/**
 * The tab strip: one role="tab" per tab with a roving tabstop, a per-tab
 * context menu with tab management actions, and a new-tab button.
 * Supports both horizontal (top chrome) and vertical (left sidebar) orientations.
 */
export default function TabStrip({
  tabs,
  activeId,
  orientation = "horizontal",
  showNewTabButton = true,
  onActivate,
  onClose,
  onNewTab,
  onReload,
  onCloseOthers,
  onCloseToRight,
  onToggleMute,
  onDiscard,
  onDuplicate,
  onReorder,
}: TabStripProps) {
  const isVertical = orientation === "vertical";
  const { listRef, handleKeyDown, handleFocus } = useListFocus({
    itemSelector: '[role="tab"]',
    orientation,
    hasRovingTabIndex: true,
    hasHomeEnd: true,
  });

  const [dragCandidate, setDragCandidate] = useState<{ id: TabId; startPos: number } | null>(null);
  const [draggingId, setDraggingId] = useState<TabId | null>(null);
  const [dropBeforeId, setDropBeforeId] = useState<TabId | null>(null);
  const [suppressedClick, setSuppressedClick] = useState<TabId | null>(null);
  const dropBeforeRef = useRef<TabId | null>(null);

  const startDrag = useCallback((id: TabId, clientPos: number) => {
    setDragCandidate({ id, startPos: clientPos });
  }, []);

  useEffect(() => {
    if (!dragCandidate) return;
    const onMove = (e: PointerEvent) => {
      const currentPos = isVertical ? e.clientY : e.clientX;
      if (Math.abs(currentPos - dragCandidate.startPos) < DRAG_THRESHOLD) return;
      const dragging = dragCandidate.id;
      if (draggingId !== dragging) {
        setDraggingId(dragging);
        dropBeforeRef.current = null;
      }
      const container = listRef.current;
      if (!container) return;
      const tabEls = Array.from(
        container.querySelectorAll<HTMLElement>('[role="tab"]')
      );
      let before: TabId | null = null;
      for (let i = 0; i < tabEls.length; i++) {
        if (tabs[i].id === dragging) continue;
        const rect = tabEls[i].getBoundingClientRect();
        const midpoint = isVertical ? rect.top + rect.height / 2 : rect.left + rect.width / 2;
        if (currentPos <= midpoint) {
          before = tabs[i].id;
          break;
        }
      }
      dropBeforeRef.current = before;
      setDropBeforeId(before);
    };
    const onUp = () => {
      if (draggingId !== null) {
        onReorder(dragCandidate.id, dropBeforeRef.current);
        setSuppressedClick(dragCandidate.id);
      }
      clearDrag();
    };
    const clearDrag = () => {
      setDragCandidate(null);
      setDraggingId(null);
      setDropBeforeId(null);
      dropBeforeRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", clearDrag);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", clearDrag);
    };
  }, [dragCandidate, draggingId, isVertical, listRef, onReorder, tabs]);

  if (isVertical) {
    return (
      <VStack
        gap={1}
        style={{
          width: "100%",
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <VStack
          ref={listRef as React.RefObject<HTMLDivElement>}
          role="tablist"
          aria-label="Sidebar Tabs"
          aria-orientation="vertical"
          gap={1}
          style={{
            width: "100%",
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
            touchAction: draggingId ? "none" : "auto",
            userSelect: draggingId ? "none" : "auto",
            paddingInline: "var(--spacing-2)",
            paddingBlock: "var(--spacing-1)",
          }}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
        >
          {tabs.map((tab) => (
            <TabItem
              key={tab.id}
              tab={tab}
              isVertical={true}
              isActive={tab.id === activeId}
              isSolo={tabs.length === 1}
              isLast={tabs.at(-1)?.id === tab.id}
              isDragging={tab.id === draggingId}
              isDropTarget={
                tab.id === dropBeforeId ||
                (dropBeforeId === null &&
                  draggingId !== null &&
                  draggingId !== tab.id &&
                  tab.id === tabs.at(-1)?.id)
              }
              suppressedClickId={suppressedClick}
              onActivate={onActivate}
              onClose={onClose}
              onNewTab={onNewTab}
              onReload={onReload}
              onCloseOthers={onCloseOthers}
              onCloseToRight={onCloseToRight}
              onToggleMute={onToggleMute}
              onDiscard={onDiscard}
              onDuplicate={onDuplicate}
              onDragStart={startDrag}
              onConsumeSuppressedClick={() => setSuppressedClick(null)}
            />
          ))}
          {/* New tab button row in the same tab column */}
          <HStack
            role="button"
            tabIndex={0}
            gap={2}
            align="center"
            paddingInline={2}
            onClick={onNewTab}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onNewTab();
              }
            }}
            style={{
              height: "var(--spacing-9)",
              width: "100%",
              flex: "none",
              boxSizing: "border-box",
              cursor: "pointer",
              borderRadius: "var(--radius-md)",
              background: "transparent",
              color: "var(--color-text-secondary)",
              border: "var(--border-width) dashed var(--color-border-subtle)",
              transition:
                "background var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "var(--color-overlay-hover)";
              (e.currentTarget as HTMLElement).style.color = "var(--color-text-primary)";
              (e.currentTarget as HTMLElement).style.borderColor = "var(--color-border)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "var(--color-text-secondary)";
              (e.currentTarget as HTMLElement).style.borderColor = "var(--color-border-subtle)";
            }}
          >
            <Plus size={16} style={{ flex: "none" }} />
            <Text type="label" style={{ minWidth: 0, flex: 1, textAlign: "left", color: "inherit" }}>
              New tab
            </Text>
          </HStack>
        </VStack>
      </VStack>
    );
  }

  return (
    <HStack
      gap={0}
      align="center"
      style={{ minWidth: 0, flex: 1, height: "100%" }}
      data-tauri-drag-region
    >
      <HStack
        ref={listRef as React.RefObject<HTMLDivElement>}
        role="tablist"
        aria-label="Tabs"
        aria-orientation="horizontal"
        gap={0}
        align="center"
        style={{
          minWidth: 0,
          flex: "0 1 auto",
          height: "100%",
          overflow: "hidden",
          touchAction: draggingId ? "none" : "auto",
          userSelect: draggingId ? "none" : "auto",
        }}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
      >
        {tabs.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isVertical={false}
            isActive={tab.id === activeId}
            isSolo={tabs.length === 1}
            isLast={tabs.at(-1)?.id === tab.id}
            isDragging={tab.id === draggingId}
            isDropTarget={
              tab.id === dropBeforeId ||
              (dropBeforeId === null &&
                draggingId !== null &&
                draggingId !== tab.id &&
                tab.id === tabs.at(-1)?.id)
            }
            suppressedClickId={suppressedClick}
            onActivate={onActivate}
            onClose={onClose}
            onNewTab={onNewTab}
            onReload={onReload}
            onCloseOthers={onCloseOthers}
            onCloseToRight={onCloseToRight}
            onToggleMute={onToggleMute}
            onDiscard={onDiscard}
            onDuplicate={onDuplicate}
            onDragStart={startDrag}
            onConsumeSuppressedClick={() => setSuppressedClick(null)}
          />
        ))}
      </HStack>
      {showNewTabButton && (
        <IconButton
          size="sm"
          variant="ghost"
          label="New tab"
          icon={<Plus size={16} />}
          onClick={onNewTab}
          tooltip="New tab (Ctrl+T)"
          style={{ flex: "none", marginInlineStart: "var(--spacing-1)" }}
        />
      )}
    </HStack>
  );
}

interface TabItemProps {
  tab: TabInfo;
  isVertical: boolean;
  isActive: boolean;
  isSolo: boolean;
  isLast: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  suppressedClickId: TabId | null;
  onActivate: (id: TabId) => void;
  onClose: (id: TabId) => void;
  onNewTab: () => void;
  onReload: (id: TabId) => void;
  onCloseOthers: (id: TabId) => void;
  onCloseToRight: (id: TabId) => void;
  onToggleMute: (id: TabId) => void;
  onDiscard: (id: TabId) => void;
  onDuplicate: (id: TabId) => void;
  onDragStart: (id: TabId, clientPos: number) => void;
  onConsumeSuppressedClick: () => void;
}

function TabItem({
  tab,
  isVertical,
  isActive,
  isSolo,
  isLast,
  isDragging,
  isDropTarget,
  suppressedClickId,
  onActivate,
  onClose,
  onNewTab,
  onReload,
  onCloseOthers,
  onCloseToRight,
  onToggleMute,
  onDiscard,
  onDuplicate,
  onDragStart,
  onConsumeSuppressedClick,
}: TabItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate(tab.id);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "w") {
        e.preventDefault();
        e.stopPropagation();
        onClose(tab.id);
      } else if (e.key === "Escape") {
        (e.currentTarget as HTMLElement).blur();
      }
    },
    [onActivate, onClose, tab.id]
  );

  return (
    <ContextMenu
      label={`Actions for tab ${tab.title}`}
      items={[
        { label: "New Tab", icon: <Plus size={14} />, onClick: onNewTab },
        { type: "divider" },
        { label: "Reload", icon: <RefreshCw size={14} />, onClick: () => onReload(tab.id) },
        { label: "Duplicate", icon: <Copy size={14} />, onClick: () => onDuplicate(tab.id) },
        {
          label: tab.muted ? "Unmute Tab" : "Mute Tab",
          isDisabled: !tab.audio && !tab.muted,
          icon: tab.muted ? <VolumeX size={14} /> : <Volume2 size={14} />,
          onClick: () => onToggleMute(tab.id),
        },
        { type: "divider" },
        {
          label: "Discard Tab",
          isDisabled: tab.discarded || tab.is_active || tab.loading,
          icon: <Moon size={14} />,
          onClick: () => onDiscard(tab.id),
        },
        { type: "divider" },
        { label: "Close Tab", icon: <X size={14} />, onClick: () => onClose(tab.id) },
        {
          label: "Close Other Tabs",
          isDisabled: isSolo || !isActive,
          onClick: () => onCloseOthers(tab.id),
        },
        {
          label: isVertical ? "Close Tabs Below" : "Close Tabs to the Right",
          isDisabled: isLast,
          onClick: () => onCloseToRight(tab.id),
        },
      ]}
    >
      <HStack
        role="tab"
        id={`rowster-tab-${tab.id}`}
        aria-selected={isActive}
        aria-grabbed={isDragging}
        tabIndex={-1}
        gap={2}
        align="center"
        paddingInline={2}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          if ((e.target as HTMLElement).closest("button")) return;
          onDragStart(tab.id, isVertical ? e.clientY : e.clientX);
        }}
        onClick={() => {
          if (suppressedClickId === tab.id) {
            onConsumeSuppressedClick();
            return;
          }
          onActivate(tab.id);
        }}
        style={{
          height: isVertical ? "var(--spacing-9)" : "var(--spacing-8)",
          width: isVertical ? "100%" : "auto",
          maxWidth: isVertical ? "none" : 220,
          minWidth: isVertical ? "100%" : 48,
          flex: isVertical ? "none" : "1 1 auto",
          boxSizing: "border-box",
          cursor: "pointer",
          borderRadius: "var(--radius-md)",
          background: isActive
            ? "var(--color-background-surface)"
            : isHovered
              ? "var(--color-overlay-hover)"
              : "transparent",
          color: isActive
            ? "var(--color-text-primary)"
            : "var(--color-text-secondary)",
          opacity: isDragging ? 0.5 : 1,
          boxShadow: isDropTarget
            ? isVertical
              ? "inset 0 2px 0 var(--color-accent-base), inset 0 -2px 0 transparent"
              : "inset 2px 0 0 var(--color-accent-base)"
            : "inset 0 0 0 transparent",
          border: isActive
            ? "var(--border-width) solid var(--color-border)"
            : "var(--border-width) solid transparent",
          transition: "box-shadow var(--duration-fast) var(--ease-standard), background var(--duration-fast) var(--ease-standard)",
        }}
      >
        {tab.loading ? (
          <Spinner size="sm" aria-label={`Loading ${tab.title}`} />
        ) : tab.discarded ? (
          <StatusDot variant="neutral" label={`${tab.title} is discarded`} tooltip="Discarded tab" />
        ) : tab.sleeping ? (
          <Icon icon={Moon} size="sm" color="inherit" />
        ) : tab.favicon_url ? (
          <img
            src={tab.favicon_url}
            alt=""
            width={16}
            height={16}
            style={{ flex: "none", borderRadius: "var(--radius-sm)" }}
          />
        ) : (
          <Icon icon={Globe} size="sm" color="inherit" />
        )}
        <Text type="label" maxLines={1} style={{ minWidth: 0, flex: 1, textAlign: "left" }}>
          {tab.title}
        </Text>
        {(tab.audio || tab.muted) && (
          <IconButton
            size="sm"
            variant="ghost"
            label={`${tab.muted ? "Unmute" : "Mute"} tab ${tab.title}`}
            icon={tab.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
            onClick={(e) => {
              e.stopPropagation();
              onToggleMute(tab.id);
            }}
            tooltip={tab.muted ? "Unmute tab" : "Mute tab"}
            style={{ flex: "none" }}
          />
        )}
        <IconButton
          size="sm"
          variant="ghost"
          label={`Close tab ${tab.title}`}
          icon={<X size={12} />}
          onClick={(e) => {
            e.stopPropagation();
            onClose(tab.id);
          }}
          tooltip="Close tab (Ctrl+W)"
          style={{
            opacity: isActive || isHovered ? 1 : 0,
            flex: "none",
          }}
        />
      </HStack>
    </ContextMenu>
  );
}
