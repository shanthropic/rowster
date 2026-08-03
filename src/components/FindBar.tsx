import { useCallback, useEffect, useRef, useState } from "react";
import { CaseSensitive, ChevronDown, ChevronUp, X } from "lucide-react";
import { Section } from "@astryxdesign/core/Section";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { IconButton } from "@astryxdesign/core/IconButton";
import { EV, findNext, findPrev, findStart, onChromeEvent } from "../ipc";
import type { FindStatusPayload, TabId } from "../types";

interface FindBarProps {
  tabId: TabId;
  onClose: () => void;
}

const DEBOUNCE_MS = 200;

export default function FindBar({ tabId, onClose }: FindBarProps) {
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  /** undefined = not yet counted; null = engine reported no count. */
  const [count, setCount] = useState<number | null | undefined>(undefined);
  const containerRef = useRef<HTMLElement | null>(null);

  const runStart = useCallback(
    (q: string, cs: boolean) => {
      setCount(undefined);
      void findStart(tabId, q, cs);
    },
    [tabId]
  );

  // Debounced kickoff while typing.
  useEffect(() => {
    const timer = setTimeout(() => runStart(query, caseSensitive), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, caseSensitive, runStart]);

  // Status updates (match count) and forced closes (navigation).
  useEffect(() => {
    const unlisten = onChromeEvent<FindStatusPayload>(EV.FIND_STATUS, (payload) => {
      if (payload.tab_id !== tabId) return;
      if (payload.status === null) {
        onClose();
        return;
      }
      setCount(payload.status.match_count);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [tabId, onClose]);

  useEffect(() => {
    containerRef.current?.querySelector("input")?.focus();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        void findPrev(tabId);
      } else {
        void findNext(tabId);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const countLabel =
    count === undefined
      ? ""
      : count === null
        ? "…"
        : count === 0
          ? "No results"
          : `${count} match${count === 1 ? "" : "es"}`;

  return (
    <Section
      ref={containerRef}
      variant="muted"
      padding={2}
      dividers={["bottom", "start", "end"]}
      style={{
        position: "absolute",
        top: "var(--spacing-2)",
        right: "var(--spacing-3)",
        zIndex: 40,
        boxShadow: "var(--elevation-med)",
        borderRadius: "var(--radius-md)",
      }}
      onKeyDown={onKeyDown}
    >
      <HStack gap={2} align="center">
        <TextInput
          label="Find in page"
          isLabelHidden
          size="sm"
          value={query}
          onChange={(value) => setQuery(value)}
          placeholder="Find in page"
        />
        {countLabel ? (
          <Text type="supporting" size="xsm">
            {countLabel}
          </Text>
        ) : null}
        <IconButton
          size="sm"
          variant="ghost"
          label="Previous match (Shift+Enter)"
          icon={<ChevronUp size={14} />}
          tooltip="Previous match"
          onClick={() => void findPrev(tabId)}
        />
        <IconButton
          size="sm"
          variant="ghost"
          label="Next match (Enter)"
          icon={<ChevronDown size={14} />}
          tooltip="Next match"
          onClick={() => void findNext(tabId)}
        />
        <IconButton
          size="sm"
          variant={caseSensitive ? "primary" : "ghost"}
          label="Match case"
          icon={<CaseSensitive size={14} />}
          tooltip="Match case"
          onClick={() => setCaseSensitive((value) => !value)}
        />
        <IconButton
          size="sm"
          variant="ghost"
          label="Close find bar (Esc)"
          icon={<X size={14} />}
          tooltip="Close"
          onClick={onClose}
        />
      </HStack>
    </Section>
  );
}
