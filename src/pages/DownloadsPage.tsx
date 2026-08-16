import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  Download as DownloadIcon,
  File,
  FileCode,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Music,
  RotateCw,
  Trash2,
  Video,
  XCircle,
} from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { List, ListItem } from "@astryxdesign/core/List";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import {
  downloadCancel,
  downloadClear,
  downloadOpen,
  downloadRetry,
  downloadReveal,
  downloadsList,
  EV,
  onChromeEvent,
  runCommand,
} from "../ipc";
import type { Download } from "../types";
import BrowserPageLayout from "../components/common/BrowserPageLayout";

export interface DownloadsPageProps {
  onClose: () => void;
}

type DownloadFilter = "all" | "active" | "completed";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function getFileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (["zip", "tar", "gz", "7z", "rar", "bz2"].includes(ext)) {
    return <Archive size={18} color="var(--color-text-cyan)" />;
  }
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "ico"].includes(ext)) {
    return <ImageIcon size={18} color="var(--color-text-cyan)" />;
  }
  if (["mp4", "webm", "mkv", "avi", "mov"].includes(ext)) {
    return <Video size={18} color="var(--color-text-cyan)" />;
  }
  if (["mp3", "wav", "flac", "aac", "ogg"].includes(ext)) {
    return <Music size={18} color="var(--color-text-cyan)" />;
  }
  if (["js", "ts", "jsx", "tsx", "json", "html", "css", "py", "rs", "cpp", "c"].includes(ext)) {
    return <FileCode size={18} color="var(--color-text-cyan)" />;
  }
  if (["pdf", "doc", "docx", "txt", "md", "csv", "xlsx"].includes(ext)) {
    return <FileText size={18} color="var(--color-text-cyan)" />;
  }
  return <File size={18} color="var(--color-text-secondary)" />;
}

function statusToken(status: Download["status"]) {
  switch (status) {
    case "completed":
      return <Token label="Completed" color="green" size="sm" />;
    case "active":
      return <Token label="Downloading" color="blue" size="sm" />;
    case "requested":
      return <Token label="Waiting" color="blue" size="sm" />;
    case "failed":
      return <Token label="Failed" color="red" size="sm" />;
    case "cancelled":
      return <Token label="Cancelled" color="gray" size="sm" />;
  }
}

export default function DownloadsPage({ onClose }: DownloadsPageProps) {
  const [downloads, setDownloads] = useState<Download[] | null>(null);
  const [filter, setFilter] = useState<DownloadFilter>("all");

  const refresh = useCallback(async () => {
    setDownloads(await downloadsList());
  }, []);

  useEffect(() => {
    runCommand("Load downloads", refresh());
    const events = [
      EV.DOWNLOAD_STARTED,
      EV.DOWNLOAD_COMPLETED,
      EV.DOWNLOAD_FAILED,
      EV.DOWNLOAD_CANCELLED,
    ];
    const unlisteners = events.map((event) =>
      onChromeEvent<unknown>(event, () =>
        runCommand("Refresh downloads", refresh())
      )
    );
    return () => {
      for (const unlisten of unlisteners) void unlisten.then((fn) => fn());
    };
  }, [refresh]);

  const activeCount = useMemo(
    () =>
      downloads?.filter(
        (d) => d.status === "active" || d.status === "requested"
      ).length ?? 0,
    [downloads]
  );

  const completedCount = useMemo(
    () => downloads?.filter((d) => d.status === "completed").length ?? 0,
    [downloads]
  );

  const filteredDownloads = useMemo(() => {
    if (!downloads) return [];
    if (filter === "active") {
      return downloads.filter(
        (d) => d.status === "active" || d.status === "requested"
      );
    }
    if (filter === "completed") {
      return downloads.filter((d) => d.status === "completed");
    }
    return downloads;
  }, [downloads, filter]);

  const handleClearCompleted = () => {
    runCommand("Clear finished downloads", downloadClear().then(refresh));
  };

  const tabsElement = (
    <TabList
      value={filter}
      onChange={(value) => setFilter(value as DownloadFilter)}
      hasDivider
    >
      <Tab
        value="all"
        label="All Downloads"
        endContent={
          downloads && downloads.length > 0 ? (
            <Token label={String(downloads.length)} size="sm" />
          ) : null
        }
      />
      <Tab
        value="active"
        label="Active"
        endContent={
          activeCount > 0 ? (
            <Token label={String(activeCount)} color="blue" size="sm" />
          ) : null
        }
      />
      <Tab
        value="completed"
        label="Completed"
        endContent={
          completedCount > 0 ? (
            <Token label={String(completedCount)} color="green" size="sm" />
          ) : null
        }
      />
    </TabList>
  );

  const actionsElement =
    completedCount > 0 ? (
      <Button
        label="Clear completed"
        variant="ghost"
        size="sm"
        icon={<Trash2 size={14} />}
        onClick={handleClearCompleted}
      />
    ) : null;

  const isEmpty = downloads !== null && filteredDownloads.length === 0;

  return (
    <BrowserPageLayout
      title="Downloads"
      icon={<DownloadIcon size={20} />}
      subtitle="Downloaded files and transfer progress"
      closeLabel="Close downloads"
      onClose={onClose}
      tabs={tabsElement}
      actions={actionsElement}
      isLoading={downloads === null}
      loadingLabel="Loading downloaded files..."
    >
      {isEmpty ? (
        <EmptyState
          title={
            filter === "active"
              ? "No active downloads"
              : filter === "completed"
              ? "No completed downloads"
              : "No downloads yet"
          }
          description={
            filter === "active"
              ? "Files currently downloading will appear here."
              : "Files you download in Rowster will be listed here with quick access to open them."
          }
          icon={<DownloadIcon size={36} />}
        />
      ) : (
        <VStack gap={4} align="stretch" style={{ width: "100%" }}>
          <List density="compact" hasDividers style={{ width: "100%" }}>
            {filteredDownloads.map((download) => {
              const inProgress =
                download.status === "active" || download.status === "requested";
              const total = download.total_bytes ?? 0;
              const received = download.received_bytes ?? 0;
              const percent = total > 0 ? (received / total) * 100 : 0;

              return (
                <ListItem
                  key={download.id}
                  label={
                    <HStack gap={3} align="center">
                      <div className="download-type-icon-box">
                        {getFileIcon(download.filename)}
                      </div>
                      <VStack gap={0} align="start">
                        <Text type="label">{download.filename}</Text>
                        <Text type="supporting" color="secondary" size="sm">
                          {total > 0
                            ? `${formatBytes(received)} of ${formatBytes(total)}`
                            : download.url}
                        </Text>
                      </VStack>
                    </HStack>
                  }
                  description={
                    <VStack gap={2} align="stretch" style={{ marginTop: 4 }}>
                      <HStack gap={2} align="center">
                        {statusToken(download.status)}
                        {download.path ? (
                          <Text type="supporting" color="secondary" size="sm">
                            {download.path}
                          </Text>
                        ) : null}
                      </HStack>

                      {inProgress ? (
                        <ProgressBar
                          label={`Downloading ${download.filename}`}
                          isIndeterminate={total <= 0}
                          value={percent}
                          max={100}
                          isLabelHidden
                          hasValueLabel={total > 0}
                        />
                      ) : null}
                    </VStack>
                  }
                  endContent={
                    <HStack gap={1} align="center">
                      {download.status === "completed" && download.path ? (
                        <>
                          <IconButton
                            size="sm"
                            variant="ghost"
                            label={`Open ${download.filename}`}
                            icon={<FolderOpen size={14} />}
                            tooltip="Open file"
                            onClick={(e) => {
                              e.stopPropagation();
                              runCommand(
                                "Open download",
                                downloadOpen(download.id)
                              );
                            }}
                          />
                          <IconButton
                            size="sm"
                            variant="ghost"
                            label="Show in folder"
                            icon={<DownloadIcon size={14} />}
                            tooltip="Show in folder"
                            onClick={(e) => {
                              e.stopPropagation();
                              runCommand(
                                "Reveal download",
                                downloadReveal(download.id)
                              );
                            }}
                          />
                        </>
                      ) : null}
                      {download.status === "failed" ||
                      download.status === "cancelled" ? (
                        <IconButton
                          size="sm"
                          variant="ghost"
                          label={`Retry ${download.filename}`}
                          icon={<RotateCw size={14} />}
                          tooltip="Retry download"
                          onClick={(e) => {
                            e.stopPropagation();
                            runCommand(
                              "Retry download",
                              downloadRetry(download.id)
                            );
                          }}
                        />
                      ) : null}
                      {inProgress ? (
                        <IconButton
                          size="sm"
                          variant="ghost"
                          label={`Cancel ${download.filename}`}
                          icon={<XCircle size={14} />}
                          tooltip="Cancel download"
                          onClick={(e) => {
                            e.stopPropagation();
                            runCommand(
                              "Cancel download",
                              downloadCancel(download.id).then(refresh)
                            );
                          }}
                        />
                      ) : null}
                    </HStack>
                  }
                />
              );
            })}
          </List>

          <Text type="supporting" color="secondary" size="sm">
            Active transfers display download progress reported by the system webview engine.
          </Text>
        </VStack>
      )}
    </BrowserPageLayout>
  );
}
