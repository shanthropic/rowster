import { useEffect, useRef } from "react";
import {
  Bookmark,
  Download,
  History,
  Plus,
  Search,
  Settings,
  Undo2,
} from "lucide-react";
import {
  SideNav,
  SideNavItem,
  SideNavSection,
} from "@astryxdesign/core/SideNav";
import { HStack } from "@astryxdesign/core/HStack";
import type { ChromePage } from "../types";

interface RightSidebarProps {
  isOpen: boolean;
  activePage: ChromePage | null;
  onWidthChange: (width: number) => void;
  onNewTab: () => void;
  onReopenClosed: () => void;
  onFind: () => void;
  onShowPage: (page: ChromePage) => void;
}

export default function RightSidebar({
  isOpen,
  activePage,
  onWidthChange,
  onNewTab,
  onReopenClosed,
  onFind,
  onShowPage,
}: RightSidebarProps) {
  const containerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reportWidth = () => {
      onWidthChange(container.getBoundingClientRect().width);
    };
    reportWidth();

    const observer = new ResizeObserver(reportWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, [onWidthChange]);

  return (
    <HStack
      ref={containerRef}
      aria-hidden={!isOpen}
      gap={0}
      style={{
        width: isOpen ? "calc(var(--spacing-12) * 5.5)" : "var(--spacing-0)",
        minWidth: isOpen ? "calc(var(--spacing-12) * 5.5)" : "var(--spacing-0)",
        height: "100%",
        overflow: "hidden",
        flex: "none",
        background: "var(--color-background-surface)",
        borderInlineStart: isOpen
          ? "var(--border-width) solid var(--color-border)"
          : "var(--spacing-0) solid transparent",
        transition:
          "width var(--duration-medium) var(--ease-standard), min-width var(--duration-medium) var(--ease-standard)",
      }}
    >
      {isOpen ? <SideNav style={{ width: "calc(var(--spacing-12) * 5.5)" }}>
        <SideNavSection title="Browser" isHeaderHidden>
          <SideNavItem label="New tab" icon={Plus} onClick={onNewTab} />
          <SideNavItem
            label="Reopen closed tab"
            icon={Undo2}
            onClick={onReopenClosed}
          />
          <SideNavItem label="Find in page" icon={Search} onClick={onFind} />
        </SideNavSection>
        <SideNavSection title="Library">
          <SideNavItem
            label="History"
            icon={History}
            isSelected={activePage === "history"}
            onClick={() => onShowPage("history")}
          />
          <SideNavItem
            label="Bookmarks"
            icon={Bookmark}
            isSelected={activePage === "bookmarks"}
            onClick={() => onShowPage("bookmarks")}
          />
          <SideNavItem
            label="Downloads"
            icon={Download}
            isSelected={activePage === "downloads"}
            onClick={() => onShowPage("downloads")}
          />
        </SideNavSection>
        <SideNavSection title="Preferences">
          <SideNavItem
            label="Settings"
            icon={Settings}
            isSelected={activePage === "settings"}
            onClick={() => onShowPage("settings")}
          />
        </SideNavSection>
      </SideNav> : null}
    </HStack>
  );
}
