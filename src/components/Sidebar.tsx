import { useEffect, useRef } from "react";
import { HStack } from "@astryxdesign/core/HStack";

interface BrowserSidebarProps {
  isOpen: boolean;
  onWidthChange: (width: number) => void;
}

export default function BrowserSidebar({
  isOpen,
  onWidthChange,
}: BrowserSidebarProps) {
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
        borderInlineEnd: isOpen
          ? "var(--border-width) solid var(--color-border)"
          : "var(--spacing-0) solid transparent",
        transition:
          "width var(--duration-medium) var(--ease-standard), min-width var(--duration-medium) var(--ease-standard)",
      }}
    />
  );
}
