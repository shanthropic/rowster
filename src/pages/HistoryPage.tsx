import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, History as HistoryIcon, Search, Trash2 } from "lucide-react";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { List, ListItem } from "@astryxdesign/core/List";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { historyClear, historyDelete, historyQuery, runCommand } from "../ipc";
import type { HistoryEntry } from "../types";
import BrowserPageLayout from "../components/common/BrowserPageLayout";

export interface HistoryPageProps {
  onClose: () => void;
  onNavigate: (url: string) => void;
}

function relativeTime(epoch: number, now: number): string {
  const delta = Math.max(0, now - epoch);
  const minutes = Math.floor(delta / 60);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const date = new Date(epoch * 1000);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function getDayBucket(epoch: number, now: number): "Today" | "Yesterday" | "Past 7 Days" | "Older" {
  const diffDays = Math.floor((now - epoch) / 86400);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "Past 7 Days";
  return "Older";
}

export default function HistoryPage({
  onClose,
  onNavigate,
}: HistoryPageProps) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [query, setQuery] = useState("");
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const refresh = useCallback(async (q: string) => {
    const result = await historyQuery(q || undefined, 300);
    setEntries(result);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      runCommand("Search history", refresh(query));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query, refresh]);

  const handleClearAll = () => {
    setClearing(true);
    void historyClear()
      .then(() => {
        setEntries([]);
        setIsClearDialogOpen(false);
      })
      .finally(() => setClearing(false));
  };

  const handleDelete = async (id: number) => {
    const removed = await historyDelete(id);
    if (removed) {
      setEntries((current) => (current ?? []).filter((e) => e.id !== id));
    }
  };

  const getHostname = (url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  };

  const now = Date.now() / 1000;

  const groupedEntries = useMemo(() => {
    if (!entries) return [];
    const groups: Record<string, HistoryEntry[]> = {
      Today: [],
      Yesterday: [],
      "Past 7 Days": [],
      Older: [],
    };
    for (const entry of entries) {
      const bucket = getDayBucket(entry.visit_time, now);
      groups[bucket].push(entry);
    }
    return Object.entries(groups).filter(([_, items]) => items.length > 0);
  }, [entries, now]);

  const isEmpty = entries !== null && entries.length === 0;

  const searchElement = (
    <div style={{ width: 280, maxWidth: "100%" }}>
      <TextInput
        label="Search history"
        isLabelHidden
        value={query}
        onChange={setQuery}
        placeholder="Filter history..."
        startIcon={<Search size={15} />}
        hasClear
        width="100%"
      />
    </div>
  );

  const actionsElement =
    entries && entries.length > 0 ? (
      <Button
        label="Clear browsing history"
        variant="destructive"
        size="sm"
        icon={<Trash2 size={14} />}
        onClick={() => setIsClearDialogOpen(true)}
      />
    ) : null;

  return (
    <BrowserPageLayout
      title="History"
      icon={<HistoryIcon size={20} />}
      subtitle="Web pages you have visited recently"
      closeLabel="Close history"
      onClose={onClose}
      search={searchElement}
      actions={actionsElement}
      isLoading={entries === null}
      loadingLabel="Loading browsing history..."
    >
      {isEmpty ? (
        <EmptyState
          title={query ? "No matching visits" : "No browsing history"}
          description={
            query
              ? `No pages in your history match "${query}".`
              : "Websites you navigate to will show up here chronologically."
          }
          icon={<HistoryIcon size={36} />}
        />
      ) : (
        <VStack gap={5} align="stretch" style={{ width: "100%" }}>
          {groupedEntries.map(([groupName, items]) => (
            <VStack key={groupName} gap={2} align="stretch" style={{ width: "100%" }}>
              <HStack justify="between" align="center" paddingInline={2}>
                <Heading level={4} style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
                  {groupName}
                </Heading>
                <Text type="supporting" color="secondary" size="sm">
                  {items.length} {items.length === 1 ? "page" : "pages"}
                </Text>
              </HStack>

              <List density="compact" hasDividers style={{ width: "100%" }}>
                {items.map((entry) => {
                  const domain = getHostname(entry.url);
                  return (
                    <ListItem
                      key={entry.id}
                      label={
                        <HStack gap={2} align="center">
                          <Text type="label" maxLines={1}>
                            {entry.title?.trim() || entry.url}
                          </Text>
                          {domain ? <Token label={domain} size="sm" /> : null}
                        </HStack>
                      }
                      description={entry.url}
                      onClick={() => onNavigate(entry.url)}
                      endContent={
                        <HStack gap={2} align="center">
                          <Text type="supporting" size="sm" style={{ flexShrink: 0 }}>
                            {relativeTime(entry.visit_time, now)}
                          </Text>
                          <IconButton
                            size="sm"
                            variant="ghost"
                            label={`Open ${entry.title ?? entry.url}`}
                            icon={<ExternalLink size={14} />}
                            tooltip="Open in new tab"
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigate(entry.url);
                            }}
                          />
                          <IconButton
                            size="sm"
                            variant="ghost"
                            label={`Remove from history`}
                            icon={<Trash2 size={14} />}
                            tooltip="Remove entry"
                            onClick={(e) => {
                              e.stopPropagation();
                              runCommand(
                                "Delete history entry",
                                handleDelete(entry.id)
                              );
                            }}
                          />
                        </HStack>
                      }
                    />
                  );
                })}
              </List>
            </VStack>
          ))}
        </VStack>
      )}

      {/* Safe Clear History AlertDialog */}
      <AlertDialog
        isOpen={isClearDialogOpen}
        onOpenChange={setIsClearDialogOpen}
        title="Clear all browsing history?"
        description="This action cannot be undone. All recorded visits, timestamps, and page titles will be permanently removed from this device."
        actionLabel="Clear history"
        actionVariant="destructive"
        isActionLoading={clearing}
        onAction={handleClearAll}
      />
    </BrowserPageLayout>
  );
}
