import { useEffect, useState } from "react";
import { Search, ChevronDown, Compass } from "lucide-react";
import { Popover } from "@astryxdesign/core/Popover";
import { VStack } from "@astryxdesign/core/VStack";
import { normalizeAddress } from "../../nav";
import { settingsGet } from "../../ipc";
import type { HistoryEntry } from "../../types";

export interface SearchEngine {
  id: string;
  name: string;
  template: string;
  icon: "google" | "duck" | "bing" | "brave" | "startpage" | "custom";
}

export const SEARCH_ENGINES: SearchEngine[] = [
  { id: "duck", name: "DuckDuckGo", template: "https://duckduckgo.com/?q={q}", icon: "duck" },
  { id: "google", name: "Google", template: "https://www.google.com/search?q={q}", icon: "google" },
  { id: "bing", name: "Bing", template: "https://www.bing.com/search?q={q}", icon: "bing" },
  { id: "brave", name: "Brave", template: "https://search.brave.com/search?q={q}", icon: "brave" },
  { id: "startpage", name: "Startpage", template: "https://www.startpage.com/sp/search?query={q}", icon: "startpage" },
];

/*
 * FREQUENT SEARCH SITES (DISABLED FOR LATER USE)
 * =========================================================================
 * const DEFAULT_QUICK_LINKS = [
 *   { label: "GitHub", url: "https://github.com" },
 *   { label: "Wikipedia", url: "https://en.wikipedia.org" },
 *   { label: "MDN Web Docs", url: "https://developer.mozilla.org" },
 *   { label: "Hacker News", url: "https://news.ycombinator.com" },
 *   { label: "YouTube", url: "https://www.youtube.com" },
 * ];
 */

interface SearchSectionProps {
  onNavigate: (url: string) => void;
  frequent?: HistoryEntry[];
}

function EngineIcon({ type }: { type: SearchEngine["icon"] }) {
  switch (type) {
    case "google":
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
        </svg>
      );
    case "duck":
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14.93c-2.61.42-4.9-1.2-5.45-3.62-.31-1.39.06-2.73.91-3.71.85-.98 2.1-1.52 3.49-1.48 1.4.03 2.62.65 3.4 1.68.79 1.03 1.04 2.39.69 3.75-.45 1.76-1.63 3.01-3.04 3.38zM15 9c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z" />
        </svg>
      );
    case "bing":
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M5 2v20l4.5-2.6L14 22l6-3.5V11L13 7l-3.5 2V2H5zm4.5 9.5L14 9l3 1.8-4.5 4.7-3-2z" />
        </svg>
      );
    case "brave":
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 4.2c2.8 0 5.07 2.27 5.07 5.07 0 2.8-2.27 5.07-5.07 5.07s-5.07-2.27-5.07-5.07c0-2.8 2.27-5.07 5.07-5.07z" />
        </svg>
      );
    case "startpage":
    case "custom":
    default:
      return <Compass size={16} />;
  }
}

export default function SearchSection({ onNavigate }: SearchSectionProps) {
  const [draft, setDraft] = useState("");
  const [selectedEngine, setSelectedEngine] = useState<string>(() => {
    return localStorage.getItem("rowster_search_engine") || "duck";
  });

  // Automatically detect default search engine from app settings if no manual override
  useEffect(() => {
    let active = true;
    void settingsGet()
      .then((settings) => {
        if (!active || !settings?.search_engine) return;
        const matched = SEARCH_ENGINES.find((e) => e.template === settings.search_engine);
        if (matched && !localStorage.getItem("rowster_search_engine")) {
          setSelectedEngine(matched.id);
        }
      })
      .catch(() => {
        // Fallback gracefully
      });
    return () => {
      active = false;
    };
  }, []);

  const currentEngine =
    SEARCH_ENGINES.find((e) => e.id === selectedEngine) || SEARCH_ENGINES[0];

  const handleSelectEngine = (id: string) => {
    setSelectedEngine(id);
    localStorage.setItem("rowster_search_engine", id);
  };

  const submitSearch = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;

    // Direct domain or URL check
    const normalized = normalizeAddress(trimmed);
    const isDirectUrl =
      /^(?:https?:\/\/|localhost|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})/.test(trimmed) &&
      !trimmed.includes(" ");

    if (isDirectUrl) {
      onNavigate(normalized);
      return;
    }

    const engine = SEARCH_ENGINES.find((e) => e.id === selectedEngine) || SEARCH_ENGINES[0];
    const searchUrl = engine.template.replace("{q}", encodeURIComponent(trimmed));
    onNavigate(searchUrl);
  };

  /*
   * FREQUENT SITES POPOVER CONTENT (DISABLED FOR LATER USE)
   * =========================================================================
   * const currentFrequentItems =
   *   frequent && frequent.length > 0
   *     ? frequent.map((f) => ({
   *         label: f.domain ?? new URL(f.url).hostname,
   *         url: f.url,
   *       }))
   *     : DEFAULT_QUICK_LINKS;
   *
   * const frequentPopoverContent = (
   *   <VStack gap={3} padding={4} style={{ width: 300 }}>
   *     <HStack align="center" justify="between">
   *       <Heading level={4} style={{ fontSize: "var(--font-size-base)" }}>
   *         Frequent Sites
   *       </Heading>
   *       <Text type="supporting" size="sm">
   *         {currentFrequentItems.length} sites
   *       </Text>
   *     </HStack>
   *     <VStack gap={1}>
   *       {currentFrequentItems.map((item) => (
   *         <button
   *           key={item.url}
   *           type="button"
   *           className="newtab-frequent-item"
   *           onClick={() => onNavigate(item.url)}
   *         >
   *           <Globe size={16} style={{ flex: "none", color: "var(--color-icon-secondary)" }} />
   *           <Text type="label" maxLines={1} style={{ flex: 1, textAlign: "left" }}>
   *             {item.label}
   *           </Text>
   *           <ExternalLink size={14} style={{ opacity: 0.5, flex: "none" }} />
   *         </button>
   *       ))}
   *     </VStack>
   *   </VStack>
   * );
   */

  const engineMenuContent = (
    <VStack gap={1} padding={2} style={{ minWidth: 170 }}>
      {SEARCH_ENGINES.map((engine) => {
        const isSelected = selectedEngine === engine.id;
        return (
          <button
            key={engine.id}
            type="button"
            className={`search-engine-menu-item ${isSelected ? "selected" : ""}`}
            onClick={() => handleSelectEngine(engine.id)}
          >
            <span className="search-engine-menu-icon">
              <EngineIcon type={engine.icon} />
            </span>
            <span className="search-engine-menu-name">{engine.name}</span>
            {isSelected && <span className="search-engine-menu-active-dot" />}
          </button>
        );
      })}
    </VStack>
  );

  return (
    <div className="newtab-search-area">
      {/* Capsule Search Bar with Integrated Engine Selector and Search Button */}
      <form
        className="material-search-bar"
        onSubmit={(e) => {
          e.preventDefault();
          submitSearch();
        }}
      >
        {/* Search Engine Selector Dropdown Trigger */}
        <div className="search-engine-picker-wrap">
          <Popover
            content={engineMenuContent}
            placement="below"
            alignment="start"
            label="Search engine selector"
          >
            <button
              type="button"
              className="search-engine-trigger-btn"
              title={`Searching with ${currentEngine.name}. Click to change.`}
              aria-label={`Search engine: ${currentEngine.name}`}
            >
              <span className="search-engine-trigger-icon">
                <EngineIcon type={currentEngine.icon} />
              </span>
              <ChevronDown size={13} className="search-engine-chevron" />
            </button>
          </Popover>
        </div>

        <input
          type="text"
          className="material-search-input"
          placeholder={`Search with ${currentEngine.name} or enter URL...`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          spellCheck={false}
          autoComplete="off"
        />

        <button type="submit" className="material-search-btn">
          <Search size={16} aria-hidden="true" />
          <span>Search</span>
        </button>
      </form>
    </div>
  );
}
