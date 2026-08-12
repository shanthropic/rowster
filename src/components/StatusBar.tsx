import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { Button } from "@astryxdesign/core/Button";
import { Spinner } from "@astryxdesign/core/Spinner";
import { downloadsList, EV, onChromeEvent, runCommand } from "../ipc";

export interface StatusBarProps {
  visible: boolean;
  onOpenDownloads: () => void;
}

/** Bottom tray: shows a chip while downloads are active; click opens Downloads. */
export default function StatusBar({ visible, onOpenDownloads }: StatusBarProps) {
  const [activeCount, setActiveCount] = useState(0);

  useEffect(() => {
    const refresh = async () => {
      const downloads = await downloadsList();
      setActiveCount(downloads.filter((d) => d.status === "active").length);
    };
    runCommand("Load download status", refresh());
    const events = [
      EV.DOWNLOAD_STARTED,
      EV.DOWNLOAD_COMPLETED,
      EV.DOWNLOAD_FAILED,
      EV.DOWNLOAD_CANCELLED,
    ];
    const unlisteners = events.map((event) =>
      onChromeEvent<unknown>(event, () => runCommand("Refresh download status", refresh()))
    );
    return () => {
      for (const unlisten of unlisteners) void unlisten.then((fn) => fn());
    };
  }, []);

  if (!visible || activeCount === 0) return null;

  return (
    <Toolbar
      id="rowster-statusbar"
      label="Status bar"
      size="sm"
      gap={1}
      startContent={
        <Button
          label={`${activeCount} download${activeCount === 1 ? "" : "s"} active`}
          variant="ghost"
          size="sm"
          icon={<Spinner size="sm" aria-label="Downloading" />}
          onClick={onOpenDownloads}
        />
      }
      endContent={
        <Button
          label="Open Downloads"
          variant="ghost"
          size="sm"
          icon={<Download size={14} />}
          onClick={onOpenDownloads}
        />
      }
    />
  );
}
