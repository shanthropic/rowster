import { useEffect, useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import type { Bookmark } from "../../types";

interface BookmarkEditDialogProps {
  isOpen: boolean;
  bookmark: Bookmark | null;
  onClose: () => void;
  onSave: (title: string, url: string) => Promise<void>;
}

export default function BookmarkEditDialog({
  isOpen,
  bookmark,
  onClose,
  onSave,
}: BookmarkEditDialogProps) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (bookmark) {
      setTitle(bookmark.title);
      setUrl(bookmark.url ?? "");
    } else {
      setTitle("");
      setUrl("");
    }
    setError(null);
  }, [bookmark, isOpen]);

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    const trimmedUrl = url.trim();
    if (!trimmedTitle) {
      setError("Please enter a bookmark title.");
      return;
    }
    if (!trimmedUrl) {
      setError("Please enter a valid URL.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmedTitle, trimmedUrl);
      onClose();
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      width={460}
      purpose="form"
    >
      <VStack gap={4} padding={6}>
        <DialogHeader
          title={bookmark ? "Edit Bookmark" : "Add Bookmark"}
          subtitle={
            bookmark
              ? "Update the title or destination URL of this bookmark."
              : "Save a new website URL to your bookmarks."
          }
          onOpenChange={(open) => {
            if (!open) onClose();
          }}
        />

        {error ? (
          <Banner
            status="error"
            title="Could not save bookmark"
            description={error}
            isDismissable
            onDismiss={() => setError(null)}
          />
        ) : null}

        <VStack gap={3} align="stretch" style={{ width: "100%" }}>
          <TextInput
            label="Title"
            value={title}
            onChange={setTitle}
            placeholder="e.g. GitHub"
            hasAutoFocus
            isRequired
          />
          <TextInput
            label="URL"
            value={url}
            onChange={setUrl}
            placeholder="https://example.com"
            isRequired
            description="Include http:// or https://"
          />
        </VStack>

        <HStack justify="end" gap={2} style={{ width: "100%", marginTop: 8 }}>
          <Button
            label="Cancel"
            variant="ghost"
            size="sm"
            onClick={onClose}
            isDisabled={saving}
          />
          <Button
            label={bookmark ? "Save changes" : "Add bookmark"}
            variant="primary"
            size="sm"
            isLoading={saving}
            isDisabled={!title.trim() || !url.trim()}
            onClick={handleSubmit}
          />
        </HStack>
      </VStack>
    </Dialog>
  );
}
