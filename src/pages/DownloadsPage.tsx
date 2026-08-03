import { useCallback, useEffect, useState } from "react";
import { Download as DownloadIcon, FolderOpen, RotateCw, Trash2, X, XCircle } from "lucide-react";
import { Heading } from "@astryxdesign/core/Heading";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { Divider } from "@astryxdesign/core/Divider";
import { List, ListItem } from "@astryxdesign/core/List";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Spinner } from "@astryxdesign/core/Spinner";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import {
  downloadCancel,
  downloadClear,
  downloadOpen,
  downloadRetry,
  downloadReveal,
  downloadsList,
} from "../ipc";
import type { Download } from "../types";

export interface DownloadsPageProps {
  onClose: () => void;
}

function statusLabel(status: Download["status"]): string {
  switch (status) {
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
    void refresh();
  }, [refresh]);

  const isEmpty = downloads !== null && downloads.length === 0;

  return (
    <VStack gap={4} align="center" style={{ height: "100%", overflowY: "auto", padding: "var(--spacing-8)" }}>
      <VStack gap={4} align="start" style={{ width: "80%" }}>
        <HStack gap={3} align="center" justify="between" style={{ width: "100%" }}>
          <Heading level={2}>Downloads</Heading>
          <HStack gap={2} align="center">
            <IconButton
              size="sm"
              variant="ghost"
              label="Clear finished downloads"
              icon={<Trash2 size={16} />}
              onClick={() => void downloadClear().then(() => void refresh())}
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
            {downloads.map((download) => (
              <ListItem
                key={download.id}
                label={download.filename}
                description={`${statusLabel(download.status)} · ${download.url}`}
                endContent={
                  <HStack gap={1} align="center">
                    {download.status === "active" ? (
                      <Spinner size="sm" aria-label="Downloading" />
                    ) : null}
                    {download.status === "completed" && download.path ? (
                      <>
                        <IconButton
                          size="sm"
                          variant="ghost"
                          label={`Open ${download.filename}`}
                          icon={<FolderOpen size={14} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            void downloadOpen(download.id);
                          }}
                        />
                        <IconButton
                          size="sm"
                          variant="ghost"
                          label="Show in folder"
                          icon={<DownloadIcon size={14} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            void downloadReveal(download.id);
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
                          void downloadRetry(download.id);
                        }}
                      />
                    ) : null}
                    {download.status === "active" ? (
                      <IconButton
                        size="sm"
                        variant="ghost"
                        label={`Cancel ${download.filename}`}
                        icon={<XCircle size={14} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          void downloadCancel(download.id).then(() => void refresh());
                        }}
                      />
                    ) : null}
                  </HStack>
                }
              />
            ))}
          </List>
        )}
        <Text type="supporting" size="sm">
          Progress percentages are indeterminate on macOS and Linux in v1; the
          tray shows a spinner while a download is active.
        </Text>
      </VStack>
    </VStack>
  );
}
