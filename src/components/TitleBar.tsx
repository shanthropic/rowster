import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, PanelLeftClose, PanelLeftOpen, Square, X } from "lucide-react";
import { IconButton } from "@astryxdesign/core/IconButton";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import TabStrip, { type TabStripProps } from "./TabStrip";
import { runCommand } from "../ipc";

/**
 * Row 1 of the chrome: window drag region, tab strip, new-tab button and
 * window controls. The window is frameless (decorations: false), so this
 * row is also the drag handle — empty areas carry `data-tauri-drag-region`.
 */
interface TitleBarProps extends TabStripProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export default function TitleBar({
  isSidebarOpen,
  onToggleSidebar,
  ...tabStripProps
}: TitleBarProps) {
  return (
    <HStack
      gap={0}
      paddingInline={1}
      align="center"
      style={{ height: "var(--spacing-10)", minWidth: 0 }}
      data-tauri-drag-region
    >
      <IconButton
        size="sm"
        variant="ghost"
        label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
        icon={
          isSidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />
        }
        onClick={onToggleSidebar}
        tooltip={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
      />
      <Text type="label" className="browser-wordmark">ROWSTER</Text>
      <TabStrip {...tabStripProps} />
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
      runCommand("Read window state", window.isMaximized().then((max) => {
        if (alive) setIsMaximized(max);
      }));
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
        onClick={() => runCommand("Minimize window", getCurrentWindow().minimize())}
        tooltip="Minimize"
      />
      <IconButton
        size="sm"
        variant="ghost"
        label={isMaximized ? "Restore" : "Maximize"}
        icon={isMaximized ? <Copy size={14} /> : <Square size={14} />}
        onClick={() => runCommand("Toggle window size", getCurrentWindow().toggleMaximize())}
        tooltip={isMaximized ? "Restore" : "Maximize"}
      />
      <IconButton
        size="sm"
        variant="ghost"
        label="Close window"
        icon={<X size={16} />}
        onClick={() => runCommand("Close window", getCurrentWindow().close())}
        tooltip="Close"
      />
    </HStack>
  );
}
