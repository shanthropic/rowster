import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, Square, X } from "lucide-react";
import { IconButton } from "@astryxdesign/core/IconButton";
import { HStack } from "@astryxdesign/core/HStack";
import TabStrip, { type TabStripProps } from "./TabStrip";

/**
 * Row 1 of the chrome: window drag region, tab strip, new-tab button and
 * window controls. The window is frameless (decorations: false), so this
 * row is also the drag handle — empty areas carry `data-tauri-drag-region`.
 */
export default function TitleBar(props: TabStripProps) {
  return (
    <HStack
      gap={0}
      paddingInline={1}
      align="center"
      style={{ height: "var(--spacing-10)", minWidth: 0 }}
      data-tauri-drag-region
    >
      <TabStrip {...props} />
      <WindowControls />
    </HStack>
  );
}

function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);
  useEffect(() => {
    const window = getCurrentWindow();
    let alive = true;
    const sync = () =>
      void window.isMaximized().then((max) => {
        if (alive) setIsMaximized(max);
      });
    void sync();
    const unlisten = window.onResized(() => void sync());
    return () => {
      alive = false;
      void unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <HStack gap={0} align="center" data-tauri-drag-region>
      <IconButton
        size="sm"
        variant="ghost"
        label="Minimize"
        icon={<Minus size={16} />}
        onClick={() => void getCurrentWindow().minimize()}
        tooltip="Minimize"
      />
      <IconButton
        size="sm"
        variant="ghost"
        label={isMaximized ? "Restore" : "Maximize"}
        icon={isMaximized ? <Copy size={14} /> : <Square size={14} />}
        onClick={() => void getCurrentWindow().toggleMaximize()}
        tooltip={isMaximized ? "Restore" : "Maximize"}
      />
      <IconButton
        size="sm"
        variant="ghost"
        label="Close window"
        icon={<X size={16} />}
        onClick={() => void getCurrentWindow().close()}
        tooltip="Close"
      />
    </HStack>
  );
}
