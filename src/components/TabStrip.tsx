import { useCallback, useState } from "react";
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
}

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
}: TabStripProps) {
  const { listRef, handleKeyDown, handleFocus } = useListFocus({
    itemSelector: '[role="tab"]',
    orientation: "horizontal",
    hasRovingTabIndex: true,
    hasHomeEnd: true,
  });

  return (
    <HStack gap={0} align="center" style={{ minWidth: 0, flex: 1, height: "100%" }}>
      <HStack
        ref={listRef as React.RefObject<HTMLDivElement>}
        role="tablist"
        aria-label="Tabs"
        gap={0}
        align="center"
        style={{ minWidth: 0, flex: 1, height: "100%", overflow: "hidden" }}
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
            onActivate={onActivate}
            onClose={onClose}
            onNewTab={onNewTab}
            onReload={onReload}
            onCloseOthers={onCloseOthers}
            onCloseToRight={onCloseToRight}
            onToggleMute={onToggleMute}
            onDiscard={onDiscard}
            onDuplicate={onDuplicate}
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
  onActivate: (id: TabId) => void;
  onClose: (id: TabId) => void;
  onNewTab: () => void;
  onReload: (id: TabId) => void;
  onCloseOthers: (id: TabId) => void;
  onCloseToRight: (id: TabId) => void;
  onToggleMute: (id: TabId) => void;
  onDiscard: (id: TabId) => void;
  onDuplicate: (id: TabId) => void;
}

function TabItem({
  tab,
  isActive,
  isSolo,
  isLast,
  onActivate,
  onClose,
  onNewTab,
  onReload,
  onCloseOthers,
  onCloseToRight,
  onToggleMute,
  onDiscard,
  onDuplicate,
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
        tabIndex={-1}
        gap={1}
        align="center"
        paddingInline={2}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onKeyDown={onKeyDown}
        onClick={() => onActivate(tab.id)}
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
