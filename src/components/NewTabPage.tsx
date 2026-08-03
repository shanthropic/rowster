import { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { Center } from "@astryxdesign/core/Center";
import { Grid } from "@astryxdesign/core/Grid";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";
import { Heading } from "@astryxdesign/core/Heading";
import { TextInput } from "@astryxdesign/core/TextInput";
import { StackItem } from "@astryxdesign/core/Stack";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { normalizeAddress } from "../nav";
import { historyFrequent } from "../ipc";
import type { HistoryEntry } from "../types";

export interface NewTabPageProps {
  onNavigate: (address: string) => void;
}

const QUICK_LINKS = [
  { label: "Wikipedia", url: "https://en.wikipedia.org/" },
  { label: "GitHub", url: "https://github.com/" },
  { label: "MDN", url: "https://developer.mozilla.org/" },
  { label: "Hacker News", url: "https://news.ycombinator.com/" },
  { label: "YouTube", url: "https://www.youtube.com/" },
];

function formatClock(now: Date) {
  return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(now: Date) {
  return now.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function siteLabel(entry: HistoryEntry) {
  return entry.domain ?? new URL(entry.url).hostname;
}

/** The chrome new-tab page, rendered in the content area by the chrome
 *  webview (the hidden about:blank tab webview lets it show through). */
export default function NewTabPage({ onNavigate }: NewTabPageProps) {
  const [draft, setDraft] = useState("");
  const [frequent, setFrequent] = useState<HistoryEntry[]>([]);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let alive = true;
    void historyFrequent(8).then((entries) => {
      if (alive) setFrequent(entries);
    });
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    return () => {
      alive = false;
      window.clearInterval(clock);
    };
  }, []);

  const submit = () => {
    const address = normalizeAddress(draft);
    if (!address) return;
    onNavigate(address);
    setDraft("");
  };

  return (
    <VStack gap={6} align="center" style={{ height: "100%", padding: "var(--spacing-10)" }}>
      <Center style={{ flex: 1 }}>
        <VStack gap={1} align="center">
          <Heading level={1} style={{ fontSize: "var(--font-size-4xl)" }}>
            {formatClock(now)}
          </Heading>
          <Text type="supporting">{formatDate(now)}</Text>
        </VStack>
      </Center>
      <VStack gap={4} align="center" style={{ width: "60%" }}>
        <TextInput
          label="Address"
          isLabelHidden
          size="lg"
          value={draft}
          placeholder="Search or enter address"
          onChange={setDraft}
          onEnter={submit}
          startIcon={<Globe size={18} />}
          hasClear
          style={{ width: "100%" }}
        />
        {frequent.length > 0 ? (
          <VStack gap={3} align="center" style={{ width: "100%" }}>
            <Heading level={3}>Frequent</Heading>
            <Grid
              columns={{ minWidth: 180, max: 6, repeat: "fill" }}
              gap={2}
              style={{ width: "100%" }}
            >
              {frequent.map((entry) => (
                <Button
                  key={entry.domain ?? entry.url}
                  size="md"
                  variant="secondary"
                  label={siteLabel(entry)}
                  icon={<Globe size={16} />}
                  onClick={() => onNavigate(entry.url)}
                />
              ))}
            </Grid>
          </VStack>
        ) : (
          <HStack gap={2} align="center" wrap="wrap" justify="center">
            {QUICK_LINKS.map((link) => (
              <IconButton
                key={link.label}
                size="sm"
                variant="ghost"
                label={`Open ${link.label}`}
                icon={<Globe size={14} />}
                onClick={() => onNavigate(link.url)}
                tooltip={link.label}
              />
            ))}
          </HStack>
        )}
        <Text type="supporting" size="xsm">
          Try Ctrl+L to focus the address bar
        </Text>
      </VStack>
      <StackItem size="fill" />
    </VStack>
  );
}
