import { useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { bookmarksList, EV, onChromeEvent, runCommand, settingsGet } from "../ipc";
import type { Bookmark, TabId } from "../types";

export interface BookmarkBarProps {
  activeId: TabId | null;
  onNavigate: (id: TabId, address: string) => void;
}

/** Toggleable strip of root-level bookmarks below the toolbar. */
export default function BookmarkBar({ activeId, onNavigate }: BookmarkBarProps) {
  const [visible, setVisible] = useState(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

  useEffect(() => {
    const refresh = async () => {
      const [settings, list] = await Promise.all([settingsGet(), bookmarksList()]);
      setVisible(settings.show_bookmark_bar);
      setBookmarks(list.filter((b) => b.parent_id === null));
    };
    runCommand("Load bookmark bar", refresh());
    const unlisten = onChromeEvent<unknown>(EV.SETTINGS_CHANGED, () =>
      runCommand("Refresh bookmark bar", refresh())
    );
    const unlistenBookmarks = onChromeEvent<unknown>(EV.BOOKMARKS_CHANGED, () =>
      runCommand("Refresh bookmark bar", refresh())
    );
    return () => {
      void unlisten.then((fn) => fn());
      void unlistenBookmarks.then((fn) => fn());
    };
  }, []);

  if (!visible) return null;

  return (
    <Toolbar
      label="Bookmark bar"
      size="sm"
      gap={1}
      startContent={
        <HStack gap={0} align="center">
          {bookmarks.length === 0 ? (
            <Text type="supporting" size="sm">
              No bookmarks yet — star a page to pin it here.
            </Text>
          ) : (
            bookmarks.map((bookmark) => (
              <Button
                key={bookmark.id}
                label={bookmark.title}
                variant="ghost"
                size="sm"
                isDisabled={!bookmark.url || activeId === null}
                onClick={() => {
                  if (bookmark.url && activeId !== null) onNavigate(activeId, bookmark.url);
                }}
              />
            ))
          )}
        </HStack>
      }
    />
  );
}
