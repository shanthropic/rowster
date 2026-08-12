import { useEffect, useState } from "react";
import { Globe, Search } from "lucide-react";
import { Center } from "@astryxdesign/core/Center";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Grid } from "@astryxdesign/core/Grid";
import { Text } from "@astryxdesign/core/Text";
import { Heading } from "@astryxdesign/core/Heading";
import { StackItem } from "@astryxdesign/core/Stack";
import { VStack } from "@astryxdesign/core/VStack";
import { normalizeAddress } from "../nav";
import { historyFrequent, runCommand } from "../ipc";
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
    runCommand(
      "Load frequent sites",
      historyFrequent(8).then((entries) => {
        if (alive) setFrequent(entries);
      })
    );
    const clock = window.setInterval(() => setNow(new Date()), 30_000);
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
      <VStack gap={4} align="center" style={{ width: "min(100%, calc(var(--spacing-12) * 14))" }}>
        <label className="new-tab-search">
          <Search size={18} aria-hidden="true" />
          <input
            value={draft}
            aria-label="Search the web or enter an address"
            placeholder="Search the web or enter an address"
            autoCapitalize="off"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
          />
        </label>
        {frequent.length > 0 ? (
          <VStack gap={3} align="center" style={{ width: "100%" }}>
            <Heading level={3}>Frequent</Heading>
            <Grid
              columns={{ minWidth: 180, max: 6, repeat: "fill" }}
              gap={2}
              style={{ width: "100%" }}
            >
              {frequent.map((entry) => (
                <ClickableCard
                  key={entry.domain ?? entry.url}
                  label={`Open ${siteLabel(entry)}`}
                  variant="transparent"
                  padding={3}
                  onClick={() => onNavigate(entry.url)}
                >
                  <VStack gap={2} align="center">
                    <Globe size={18} />
                    <Text type="label" maxLines={1}>{siteLabel(entry)}</Text>
                  </VStack>
                </ClickableCard>
              ))}
            </Grid>
          </VStack>
        ) : (
          <Grid columns={{ minWidth: 96, max: 5, repeat: "fill" }} gap={2} style={{ width: "100%" }}>
            {QUICK_LINKS.map((link) => (
              <ClickableCard
                key={link.label}
                variant="transparent"
                padding={3}
                label={`Open ${link.label}`}
                onClick={() => onNavigate(link.url)}
              >
                <VStack gap={2} align="center">
                  <Globe size={18} />
                  <Text type="label">{link.label}</Text>
                </VStack>
              </ClickableCard>
            ))}
          </Grid>
        )}
        <Text type="supporting" size="xsm">
          Try Ctrl+L to focus the address bar
        </Text>
      </VStack>
      <StackItem size="fill" />
    </VStack>
  );
}
