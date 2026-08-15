import { useCallback, useEffect, useState } from "react";
import { Download as DownloadIcon, FolderOpen, RotateCw, Trash2, XCircle } from "lucide-react";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
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
import BrowserPage, { BrowserPageLoading } from "../components/BrowserPage";

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

function statusColor(status: Download["status"]): "gray" | "blue" | "green" | "red" {
  if (status === "completed") return "green";
  if (status === "active" || status === "requested") return "blue";
  if (status === "failed") return "red";
  return "gray";
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
    <BrowserPage
      title="Downloads"
      closeLabel="Close downloads"
      onClose={onClose}
      actions={
            <IconButton
              size="sm"
              variant="ghost"
              label="Clear finished downloads"
              icon={<Trash2 size={16} />}
              onClick={() => runCommand("Clear downloads", downloadClear().then(refresh))}
              tooltip="Clear finished downloads"
            />
      }
    >
        {downloads === null ? (
          <BrowserPageLoading label="Loading downloads" />
        ) : isEmpty ? (
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
                    <HStack gap={2} align="center" wrap="wrap">
                      <Token
                        label={statusLabel(download.status)}
                        color={statusColor(download.status)}
                        size="sm"
                      />
                      <Text type="supporting" size="sm">
                        {download.url}
                      </Text>
                    </HStack>
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
    </BrowserPage>
  );
}
