import { useCallback, useEffect, useState } from "react";
import { Download as DownloadIcon, FolderOpen, RotateCw, Trash2, X, XCircle } from "lucide-react";
import { Heading } from "@astryxdesign/core/Heading";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { Divider } from "@astryxdesign/core/Divider";
import { List, ListItem } from "@astryxdesign/core/List";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { IconButton } from "@astryxdesign/core/IconButton";
import { EmptyState } from "@astryxdesign/core/EmptyState";
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

export interface DownloadsPageProps {
  onClose: () => void;
}

function statusLabel(status: Download["status"]): string {
  switch (status) {
    case "requested":
      return "Waiting for approval";
    case "active":
      return "Downloading";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "failed":
      return "Failed";
  }
}

export default function DownloadsPage({ onClose }: DownloadsPageProps) {
  const [downloads, setDownloads] = useState<Download[] | null>(null);

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
      onChromeEvent<unknown>(event, () => runCommand("Refresh downloads", refresh()))
    );
    return () => {
      for (const unlisten of unlisteners) void unlisten.then((fn) => fn());
    };
  }, [refresh]);

  const isEmpty = downloads !== null && downloads.length === 0;

  return (
    <VStack gap={4} align="center" style={{ height: "100%", overflowY: "auto", padding: "var(--spacing-8)" }}>
      <VStack gap={4} align="start" style={{ width: "min(100%, calc(var(--spacing-12) * 20))" }}>
        <HStack gap={3} align="center" justify="between" style={{ width: "100%" }}>
          <Heading level={2}>Downloads</Heading>
          <HStack gap={2} align="center">
            <IconButton
              size="sm"
              variant="ghost"
              label="Clear finished downloads"
              icon={<Trash2 size={16} />}
              onClick={() => runCommand("Clear downloads", downloadClear().then(refresh))}
              tooltip="Clear finished downloads"
            />
            <IconButton size="sm" variant="ghost" label="Close downloads" icon={<X size={16} />} onClick={onClose} tooltip="Close (Esc)" />
          </HStack>
        </HStack>
        <Divider />

        {downloads === null ? null : isEmpty ? (
          <EmptyState
            title="No downloads"
            description="Files you download will show up here."
            icon={<DownloadIcon size={32} />}
          />
        ) : (
          <List density="compact" hasDividers style={{ width: "100%" }}>
            {downloads.map((download) => {
              const inProgress =
                download.status === "active" || download.status === "requested";
              const total = download.total_bytes ?? 0;
              const percent = total > 0 ? (download.received_bytes / total) * 100 : 0;
              return (
              <ListItem
                key={download.id}
                label={download.filename}
                description={
                  <VStack gap={1}>
                    <Text type="supporting" size="sm">
                      {statusLabel(download.status)} · {download.url}
                    </Text>
                    {inProgress ? (
                      <ProgressBar
                        label={`Progress of ${download.filename}`}
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
                          onClick={(e) => {
                            e.stopPropagation();
                            runCommand("Open download", downloadOpen(download.id));
                          }}
                        />
                        <IconButton
                          size="sm"
                          variant="ghost"
                          label="Show in folder"
                          icon={<DownloadIcon size={14} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            runCommand("Reveal download", downloadReveal(download.id));
                          }}
                        />
                      </>
                    ) : null}
                    {download.status === "failed" || download.status === "cancelled" ? (
                      <IconButton
                        size="sm"
                        variant="ghost"
                        label={`Retry ${download.filename}`}
                        icon={<RotateCw size={14} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          runCommand("Retry download", downloadRetry(download.id));
                        }}
                      />
                    ) : null}
                    {inProgress ? (
                      <IconButton
                        size="sm"
                        variant="ghost"
                        label={`Cancel ${download.filename}`}
                        icon={<XCircle size={14} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          runCommand("Cancel download", downloadCancel(download.id).then(refresh));
                        }}
                      />
                    ) : null}
                  </HStack>
                }
              />
              );
            })}
          </List>
        )}
        <Text type="supporting" size="sm">
          Active downloads show an indeterminate progress bar: the native webview
          engines do not expose byte-level progress through Tauri in v1. Rows
          remain visible until the engine reports completion or cancellation.
        </Text>
      </VStack>
    </VStack>
  );
}
