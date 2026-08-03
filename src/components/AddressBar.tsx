import { useEffect, useRef, useState } from "react";
import { ArrowRight, Globe, Lock, Star } from "lucide-react";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Spinner } from "@astryxdesign/core/Spinner";
import { InputGroup } from "@astryxdesign/core/InputGroup";
import { TextInput } from "@astryxdesign/core/TextInput";
import { bookmarkStatus, bookmarkToggle, onChromeEvent, EV } from "../ipc";
import type { TabInfo } from "../types";
import { normalizeAddress, prettyUrl } from "../nav";

export interface AddressBarProps {
  tab: TabInfo | null;
  onNavigate: (address: string) => void;
}

/** The address bar: scheme icon, editable URL, bookmark star, go/stop. */
export default function AddressBar({ tab, onNavigate }: AddressBarProps) {
  const [draft, setDraft] = useState(() => prettyUrl(tab?.url ?? ""));
  const [bookmarked, setBookmarked] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!tab) return;
    // Follow engine-driven URL changes only while the user is not editing.
    if (document.activeElement === inputRef.current) return;
    setDraft(prettyUrl(tab.url));
  }, [tab?.id, tab?.url]);

  const url = tab?.url ?? "";
  const canBookmark = url.startsWith("http://") || url.startsWith("https://");

  // Refresh the star when the page or the bookmark set changes.
  useEffect(() => {
    let cancelled = false;
    if (!canBookmark) {
      setBookmarked(false);
      return;
    }
    void bookmarkStatus(url).then((status) => {
      if (!cancelled) setBookmarked(status);
    });
    return () => {
      cancelled = true;
    };
  }, [url, canBookmark]);

  useEffect(() => {
    const unlisten = onChromeEvent<unknown>(EV.BOOKMARKS_CHANGED, () => {
      if (!canBookmark) return;
      void bookmarkStatus(url).then(setBookmarked);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [url, canBookmark]);

  // Ctrl+L from the app-level shortcut dispatches this event.
  useEffect(() => {
    const onFocusAddress = () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("rowster:focus-address", onFocusAddress);
    return () => window.removeEventListener("rowster:focus-address", onFocusAddress);
  }, []);

  const submit = () => {
    const address = normalizeAddress(draft);
    if (!address) return;
    onNavigate(address);
    inputRef.current?.blur();
  };

  const toggleBookmark = () => {
    if (!canBookmark) return;
    const title = tab?.title && tab.title !== "New Tab" ? tab.title : url;
    void bookmarkToggle(url, title).then((bookmark) => {
      setBookmarked(bookmark !== null);
    });
  };

  const isSecure = url.startsWith("https://");
  const showSpinner = tab?.loading ?? false;

  return (
    <InputGroup
      label="Address"
      isLabelHidden
      size="md"
      style={{ width: "100%" }}
    >
      <TextInput
        ref={inputRef}
        label="Address"
        isLabelHidden
        value={draft}
        placeholder="Search or enter address"
        onChange={setDraft}
        onEnter={submit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft(prettyUrl(tab?.url ?? ""));
            inputRef.current?.blur();
          }
        }}
        onFocus={(e) => (e.target as HTMLInputElement).select()}
        startIcon={<IconSchemeIcon isSecure={isSecure && !!tab?.url} />}
        style={{ minWidth: 0 }}
      />
      {canBookmark ? (
        <IconButton
          size="sm"
          variant="ghost"
          label={bookmarked ? "Remove bookmark" : "Bookmark this page"}
          icon={
            <Star
              size={15}
              fill={bookmarked ? "currentColor" : "none"}
            />
          }
          onClick={toggleBookmark}
          tooltip={bookmarked ? "Remove bookmark (Ctrl+Shift+D)" : "Bookmark this page (Ctrl+Shift+D)"}
        />
      ) : null}
      {showSpinner ? (
        <Spinner size="sm" aria-label="Loading" />
      ) : (
        <IconButton
          size="sm"
          variant="ghost"
          label="Navigate"
          icon={<ArrowRight size={16} />}
          onClick={submit}
          tooltip="Navigate to address"
        />
      )}
    </InputGroup>
  );
}

function IconSchemeIcon({ isSecure }: { isSecure: boolean }) {
  return isSecure ? <Lock size={14} /> : <Globe size={14} />;
}
