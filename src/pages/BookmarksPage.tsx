import { useCallback, useEffect, useState } from "react";
import { Bookmark as BookmarkIcon, ExternalLink, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { List, ListItem } from "@astryxdesign/core/List";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import {
  bookmarkDelete,
  bookmarkEdit,
  bookmarksList,
  bookmarkToggle,
  runCommand,
} from "../ipc";
import type { Bookmark } from "../types";
import BrowserPageLayout from "../components/common/BrowserPageLayout";
import BookmarkEditDialog from "./bookmarks/BookmarkEditDialog";

export interface BookmarksPageProps {
  onClose: () => void;
  onNavigate: (url: string) => void;
}

export default function BookmarksPage({
  onClose,
  onNavigate,
}: BookmarksPageProps) {
  const [bookmarks, setBookmarks] = useState<Bookmark[] | null>(null);
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);

  const refresh = useCallback(async (q: string) => {
    const list = await bookmarksList(q || undefined);
    setBookmarks(list);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      runCommand("Search bookmarks", refresh(query));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query, refresh]);

  const handleOpenAdd = () => {
    setEditingBookmark(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (bookmark: Bookmark) => {
    setEditingBookmark(bookmark);
    setDialogOpen(true);
  };

  const handleSaveBookmark = async (title: string, url: string) => {
    if (editingBookmark) {
      await bookmarkEdit(editingBookmark.id, title, url);
    } else {
      await bookmarkToggle(url, title);
    }
    await refresh(query);
  };

  const handleDelete = async (id: number) => {
    const removed = await bookmarkDelete(id);
    if (removed) {
      setBookmarks((current) => (current ?? []).filter((b) => b.id !== id));
    }
  };

  const getHostname = (url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  };

  const isEmpty = bookmarks !== null && bookmarks.length === 0;

  const searchElement = (
    <div style={{ width: 280, maxWidth: "100%" }}>
      <TextInput
        label="Search bookmarks"
        isLabelHidden
        value={query}
        onChange={setQuery}
        placeholder="Filter bookmarks..."
        startIcon={<Search size={15} />}
        hasClear
        width="100%"
      />
    </div>
  );

  const actionsElement = (
    <Button
      label="Add bookmark"
      variant="primary"
      size="sm"
      icon={<Plus size={15} />}
      onClick={handleOpenAdd}
    />
  );

  return (
    <BrowserPageLayout
      title="Bookmarks"
      icon={<BookmarkIcon size={20} />}
      subtitle="Saved web pages and quick references"
      closeLabel="Close bookmarks"
      onClose={onClose}
      search={searchElement}
      actions={actionsElement}
      isLoading={bookmarks === null}
      loadingLabel="Loading bookmarks..."
    >
      {isEmpty ? (
        <EmptyState
          title={query ? "No matching bookmarks" : "No saved bookmarks"}
          description={
            query
              ? `No bookmarks match "${query}". Try a different search term.`
              : "Save your favorite pages by clicking the star icon in the address bar."
          }
          icon={<BookmarkIcon size={36} />}
        />
      ) : bookmarks ? (
        <VStack gap={3} align="stretch" style={{ width: "100%" }}>
          <Text type="supporting" color="secondary" size="sm">
            {bookmarks.length} {bookmarks.length === 1 ? "bookmark" : "bookmarks"}
          </Text>
          <List density="compact" hasDividers style={{ width: "100%" }}>
            {bookmarks.map((bookmark) => {
              const url = bookmark.url ?? "";
              const domain = getHostname(url);
              return (
                <ListItem
                  key={bookmark.id}
                  label={
                    <HStack gap={2} align="center">
                      <Text type="label">{bookmark.title}</Text>
                      {domain ? (
                        <Token label={domain} size="sm" />
                      ) : null}
                    </HStack>
                  }
                  description={url}
                  onClick={() => url && onNavigate(url)}
                  endContent={
                    <HStack gap={1} align="center">
                      {url ? (
                        <IconButton
                          size="sm"
                          variant="ghost"
                          label={`Open ${bookmark.title}`}
                          icon={<ExternalLink size={14} />}
                          tooltip="Open in new tab"
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigate(url);
                          }}
                        />
                      ) : null}
                      <IconButton
                        size="sm"
                        variant="ghost"
                        label={`Edit ${bookmark.title}`}
                        icon={<Pencil size={14} />}
                        tooltip="Edit bookmark"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEdit(bookmark);
                        }}
                      />
                      <IconButton
                        size="sm"
                        variant="ghost"
                        label={`Delete ${bookmark.title}`}
                        icon={<Trash2 size={14} />}
                        tooltip="Delete bookmark"
                        onClick={(e) => {
                          e.stopPropagation();
                          runCommand("Delete bookmark", handleDelete(bookmark.id));
                        }}
                      />
                    </HStack>
                  }
                />
              );
            })}
          </List>
        </VStack>
      ) : null}

      {/* Add / Edit Dialog */}
      <BookmarkEditDialog
        isOpen={dialogOpen}
        bookmark={editingBookmark}
        onClose={() => setDialogOpen(false)}
        onSave={handleSaveBookmark}
      />
    </BrowserPageLayout>
  );
}
