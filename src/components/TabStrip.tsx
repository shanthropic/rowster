import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Globe, Moon, Plus, RefreshCw, Volume2, VolumeX, X } from "lucide-react";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { ContextMenu } from "@astryxdesign/core/ContextMenu";
import { HStack } from "@astryxdesign/core/HStack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { useListFocus } from "@astryxdesign/core/hooks";
import type { TabId, TabInfo } from "../types";

export interface TabStripProps {
  tabs: TabInfo[];
  activeId: TabId | null;
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
 * (TabList is for content sections, not browser tabs.)
 */
export default function TabStrip({
  tabs,
  activeId,
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
  const { listRef, handleKeyDown, handleFocus } = useListFocus({
    itemSelector: '[role="tab"]',
    orientation: "horizontal",
    hasRovingTabIndex: true,
    hasHomeEnd: true,
  });

  const [dragCandidate, setDragCandidate] = useState<{ id: TabId; startX: number } | null>(null);
  const [draggingId, setDraggingId] = useState<TabId | null>(null);
  const [dropBeforeId, setDropBeforeId] = useState<TabId | null>(null);
  const [suppressedClick, setSuppressedClick] = useState<TabId | null>(null);
  const dropBeforeRef = useRef<TabId | null>(null);

  const startDrag = useCallback((id: TabId, clientX: number) => {
    setDragCandidate({ id, startX: clientX });
  }, []);

  useEffect(() => {
    if (!dragCandidate) return;
    const onMove = (e: PointerEvent) => {
      if (Math.abs(e.clientX - dragCandidate.startX) < DRAG_THRESHOLD) return;
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
        if (e.clientX <= rect.left + rect.width / 2) {
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
  }, [dragCandidate, draggingId, listRef, onReorder, tabs]);

  return (
    <HStack gap={0} align="center" style={{ minWidth: 0, flex: 1, height: "100%" }}>
      <HStack
        ref={listRef as React.RefObject<HTMLDivElement>}
        role="tablist"
        aria-label="Tabs"
        gap={0}
        align="center"
        style={{
          minWidth: 0,
          flex: 1,
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
      <IconButton
        size="sm"
        variant="ghost"
        label="New tab"
        icon={<Plus size={16} />}
        onClick={onNewTab}
        tooltip="New tab (Ctrl+T)"
      />
    </HStack>
  );
}

interface TabItemProps {
  tab: TabInfo;
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
  onDragStart: (id: TabId, clientX: number) => void;
  onConsumeSuppressedClick: () => void;
}

function TabItem({
  tab,
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
          label: "Close Tabs to the Right",
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
        gap={1}
        align="center"
        paddingInline={2}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          if ((e.target as HTMLElement).closest("button")) return;
          onDragStart(tab.id, e.clientX);
        }}
        onClick={() => {
          if (suppressedClickId === tab.id) {
            onConsumeSuppressedClick();
            return;
          }
          onActivate(tab.id);
        }}
        style={{
          height: "var(--spacing-8)",
          flex: "0 1 30%",
          minWidth: 0,
          cursor: "pointer",
          borderRadius: "var(--radius-md)",
          background: isActive ? "var(--color-background-surface)" : "transparent",
          color: isActive
            ? "var(--color-text-primary)"
            : "var(--color-text-secondary)",
          opacity: isDragging ? 0.5 : 1,
          boxShadow: isDropTarget
            ? "inset 2px 0 0 var(--color-accent-base)"
            : "inset 0 0 0 transparent",
          transition: "box-shadow var(--duration-fast) var(--ease-standard)",
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
        <Text type="label" maxLines={1} style={{ minWidth: 0, flex: 1 }}>
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
