import { useEffect, useState } from "react";
import { Center } from "@astryxdesign/core/Center";
import MaterialClock from "./NewTab/MaterialClock";
import SearchSection from "./NewTab/SearchSection";
import { historyFrequent, runCommand } from "../ipc";
import type { HistoryEntry } from "../types";

export interface NewTabPageProps {
  onNavigate: (address: string) => void;
  userName: string;
}

/**
 * Modern Material You New Tab page matching the custom widget design.
 * Features an analog scalloped clock, personalized greeting/date,
 * capsule search bar, search engine picker, and a dedicated frequent sites popover.
 */
export default function NewTabPage({ onNavigate, userName }: NewTabPageProps) {
  const [frequent, setFrequent] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    let alive = true;
    runCommand(
      "Load frequent sites",
      historyFrequent(8).then((entries) => {
        if (alive) setFrequent(entries);
      })
    );
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="newtab-viewport">
      <Center style={{ height: "100%", width: "100%" }}>
        <div className="newtab-hero-container">
          <MaterialClock userName={userName} />
          <SearchSection onNavigate={onNavigate} frequent={frequent} />
        </div>
      </Center>
    </div>
  );
}
