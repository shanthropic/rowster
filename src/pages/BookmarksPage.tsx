import { useCallback, useEffect, useState } from "react";
import { Bookmark as BookmarkIcon, ExternalLink, Pencil, Search, Trash2, X } from "lucide-react";
import { Heading } from "@astryxdesign/core/Heading";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Divider } from "@astryxdesign/core/Divider";
import { List, ListItem } from "@astryxdesign/core/List";
import { IconButton } from "@astryxdesign/core/IconButton";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { bookmarkDelete, bookmarkEdit, bookmarksList } from "../ipc";
import type { Bookmark } from "../types";

export interface BookmarksPageProps {
  onClose: () => void;
  onNavigate: (url: string) => void;
}

export default function BookmarksPage({ onClose, onNavigate }: BookmarksPageProps) {
  const [bookmarks, setBookmarks] = useState<Bookmark[] | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Bookmark | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editUrl, setEditUrl] = useState("");

  const refresh = useCallback(async (q: string) => {
    setBookmarks(await bookmarksList(q || undefined));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh(query);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query, refresh]);

  const startEdit = (bookmark: Bookmark) => {
    setEditing(bookmark);
    setEditTitle(bookmark.title);
    setEditUrl(bookmark.url ?? "");
  };

  const saveEdit = async () => {
    if (editing === null) return;
    const title = editTitle.trim();
    const url = editUrl.trim();
    if (title === "" || url === "") return;
    await bookmarkEdit(editing.id, title, url);
    setEditing(null);
    void refresh(query);
  };

  const onDelete = async (id: number) => {
    const removed = await bookmarkDelete(id);
    if (removed) {
      setBookmarks((current) => (current ?? []).filter((b) => b.id !== id));
    }
  };

  const isEmpty = bookmarks !== null && bookmarks.length === 0;

  return (
    <VStack gap={4} align="center" style={{ height: "100%", overflowY: "auto", padding: "var(--spacing-8)" }}>
      <VStack gap={4} align="start" style={{ width: "80%" }}>
        <HStack gap={3} align="center" justify="between" style={{ width: "100%" }}>
          <Heading level={2}>Bookmarks</Heading>
          <IconButton
            size="sm"
            variant="ghost"
            label="Close bookmarks"
            icon={<X size={16} />}
            onClick={onClose}
            tooltip="Close (Esc)"
          />
        </HStack>
        <Divider />

        <TextInput
          label="Search bookmarks"
          isLabelHidden
          value={query}
          onChange={setQuery}
          placeholder="Search bookmarks"
          startIcon={<Search size={16} />}
          hasClear
          style={{ width: "100%" }}
        />

        {editing !== null ? (
          <VStack gap={2} style={{ width: "100%" }}>
            <TextInput
              label="Title"
              value={editTitle}
              onChange={setEditTitle}
              placeholder="Bookmark title"
              style={{ width: "100%" }}
            />
            <TextInput
              label="URL"
              value={editUrl}
              onChange={setEditUrl}
              placeholder="https://…"
              style={{ width: "100%" }}
            />
            <HStack gap={2}>
              <Button label="Save" variant="primary" size="sm" onClick={() => void saveEdit()} />
              <Button label="Cancel" variant="ghost" size="sm" onClick={() => setEditing(null)} />
            </HStack>
            <Divider />
          </VStack>
        ) : null}

        {bookmarks === null ? null : isEmpty ? (
          <EmptyState
            title="No bookmarks"
            description="Star any page in the address bar to save it here."
            icon={<BookmarkIcon size={32} />}
          />
        ) : (
          <List density="compact" hasDividers style={{ width: "100%" }}>
            {bookmarks.map((bookmark) => (
              <ListItem
                key={bookmark.id}
                label={bookmark.title}
                description={bookmark.url ?? ""}
                onClick={() => bookmark.url && onNavigate(bookmark.url)}
                endContent={
                  <HStack gap={1} align="center">
                    {bookmark.url ? (
                      <IconButton
                        size="sm"
                        variant="ghost"
                        label={`Open ${bookmark.title} in new tab`}
                        icon={<ExternalLink size={13} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigate(bookmark.url as string);
                        }}
                      />
                    ) : null}
                    <IconButton
                      size="sm"
                      variant="ghost"
                      label={`Edit ${bookmark.title}`}
                      icon={<Pencil size={13} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(bookmark);
                      }}
                    />
                    <IconButton
                      size="sm"
                      variant="ghost"
                      label={`Delete ${bookmark.title}`}
                      icon={<Trash2 size={13} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        void onDelete(bookmark.id);
                      }}
                    />
                  </HStack>
                }
              />
            ))}
          </List>
        )}
      </VStack>
    </VStack>
  );
}
