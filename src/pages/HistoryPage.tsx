import { useCallback, useEffect, useRef, useState } from "react";
import { History as HistoryIcon, Search, Trash2 } from "lucide-react";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { List, ListItem } from "@astryxdesign/core/List";
import { IconButton } from "@astryxdesign/core/IconButton";
import { TextInput } from "@astryxdesign/core/TextInput";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { historyClear, historyDelete, historyQuery, runCommand } from "../ipc";
import type { HistoryEntry } from "../types";
import BrowserPage, { BrowserPageLoading } from "../components/BrowserPage";

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
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function HistoryPage({ onClose, onNavigate }: HistoryPageProps) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [query, setQuery] = useState("");
  const [confirmingClear, setConfirmingClear] = useState(false);
  const clearTimer = useRef<number | null>(null);

  const refresh = useCallback(async (q: string) => {
    const result = await historyQuery(q || undefined, 200);
    setEntries(result);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      runCommand("Search history", refresh(query));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, refresh]);

  useEffect(() => {
    return () => {
      if (clearTimer.current !== null) window.clearTimeout(clearTimer.current);
    };
  }, []);

  const onClear = () => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      clearTimer.current = window.setTimeout(() => setConfirmingClear(false), 3000);
      return;
    }
    runCommand("Clear history", historyClear().then(() => setEntries([])));
    setConfirmingClear(false);
    if (clearTimer.current !== null) window.clearTimeout(clearTimer.current);
  };

  const onDelete = async (id: number) => {
    const removed = await historyDelete(id);
    if (removed) {
      setEntries((current) => (current ?? []).filter((e) => e.id !== id));
    }
  };

  const now = Date.now() / 1000;
  const isEmpty = entries !== null && entries.length === 0;

  return (
    <BrowserPage
      title="History"
      closeLabel="Close history"
      onClose={onClose}
      actions={
            <IconButton
              size="sm"
              variant={confirmingClear ? "destructive" : "ghost"}
              label={confirmingClear ? "Confirm clear all history" : "Clear all history"}
              icon={<Trash2 size={16} />}
              onClick={onClear}
              tooltip={confirmingClear ? "Click again to confirm" : "Clear all history"}
            />
      }
    >
        <TextInput
          label="Search history"
          isLabelHidden
          value={query}
          onChange={setQuery}
          placeholder="Search history"
          startIcon={<Search size={16} />}
          hasClear
          width="100%"
        />

        {entries === null ? (
          <BrowserPageLoading label="Loading history" />
        ) : isEmpty ? (
          <EmptyState
            title="No history"
            description={query ? "No visits match your search." : "Pages you visit will show up here."}
            icon={<HistoryIcon size={32} />}
          />
        ) : (
          <List density="compact" hasDividers style={{ width: "100%" }}>
            {entries.map((entry) => (
              <ListItem
                key={entry.id}
                label={entry.title ?? entry.url}
                description={entry.url}
                onClick={() => onNavigate(entry.url)}
                endContent={
                  <HStack gap={2} align="center">
                    <Text type="supporting" size="sm">
                      {relativeTime(entry.visit_time, now)}
                    </Text>
                    <IconButton
                      size="sm"
                      variant="ghost"
                      label={`Delete ${entry.title ?? entry.url}`}
                      icon={<Trash2 size={13} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        runCommand("Delete history entry", onDelete(entry.id));
                      }}
                    />
                  </HStack>
                }
              />
            ))}
          </List>
        )}
    </BrowserPage>
  );
}
