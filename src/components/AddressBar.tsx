import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Globe2, LockKeyhole, Search, Star } from "lucide-react";
import { Spinner } from "@astryxdesign/core/Spinner";
import { HStack } from "@astryxdesign/core/HStack";
import { bookmarkStatus, bookmarkToggle, EV, onChromeEvent, runCommand } from "../ipc";
import type { TabInfo } from "../types";
import { normalizeAddress, prettyUrl } from "../nav";

export interface AddressBarProps {
  tab: TabInfo | null;
  onNavigate: (address: string) => void;
}

export default function AddressBar({ tab, onNavigate }: AddressBarProps) {
  const id = useId();
  const [draft, setDraft] = useState(() => prettyUrl(tab?.url ?? ""));
  const [bookmarked, setBookmarked] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!focused) setDraft(prettyUrl(tab?.url ?? ""));
  }, [focused, tab?.id, tab?.url]);

  const url = tab?.url ?? "";
  const canBookmark = /^https?:\/\//.test(url);

  useEffect(() => {
    let alive = true;
    if (!canBookmark) {
      setBookmarked(false);
      return;
    }
    runCommand(
      "Check bookmark",
      bookmarkStatus(url).then((status) => {
        if (alive) setBookmarked(status);
      })
    );
    return () => {
      alive = false;
    };
  }, [canBookmark, url]);

  useEffect(() => {
    const unlisten = onChromeEvent<unknown>(EV.BOOKMARKS_CHANGED, () => {
      if (!canBookmark) return;
      runCommand("Refresh bookmark", bookmarkStatus(url).then(setBookmarked));
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [canBookmark, url]);

  useEffect(() => {
    const focusAddress = () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("rowster:focus-address", focusAddress);
    return () => window.removeEventListener("rowster:focus-address", focusAddress);
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
    runCommand(
      "Update bookmark",
      bookmarkToggle(url, title).then((bookmark) => setBookmarked(bookmark !== null))
    );
  };

  const isSecure = url.startsWith("https://");
  const icon = focused || !url ? <Search size={16} /> : isSecure ? <LockKeyhole size={15} /> : <Globe2 size={15} />;

  return (
    <label className="browser-address" data-focused={focused} htmlFor={id}>
      <HStack className="browser-address-icon" aria-hidden="true">{icon}</HStack>
      <input
        ref={inputRef}
        id={id}
        className="browser-address-input"
        value={draft}
        aria-label="Search or enter address"
        autoCapitalize="off"
        autoComplete="off"
        spellCheck={false}
        placeholder="Search the web or enter an address"
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => {
          setFocused(true);
          event.currentTarget.select();
        }}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          } else if (event.key === "Escape") {
            setDraft(prettyUrl(tab?.url ?? ""));
            event.currentTarget.blur();
          }
        }}
      />
      {canBookmark ? (
        <button
          type="button"
          className="browser-address-action"
          aria-label={bookmarked ? "Remove bookmark" : "Bookmark this page"}
          title={bookmarked ? "Remove bookmark" : "Bookmark this page"}
          onMouseDown={(event) => event.preventDefault()}
          onClick={toggleBookmark}
        >
          <Star size={15} fill={bookmarked ? "currentColor" : "none"} />
        </button>
      ) : null}
      {tab?.loading ? (
        <HStack className="browser-address-progress"><Spinner size="sm" aria-label="Loading page" /></HStack>
      ) : draft.trim() && focused ? (
        <button
          type="button"
          className="browser-address-action"
          aria-label="Navigate"
          title="Navigate"
          onMouseDown={(event) => event.preventDefault()}
          onClick={submit}
        >
          <ArrowRight size={16} />
        </button>
      ) : null}
    </label>
  );
}
