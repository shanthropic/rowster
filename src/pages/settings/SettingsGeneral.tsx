import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import type { Settings, SettingsPatch, TabLayout, ThemeMode } from "../../types";

export const SEARCH_ENGINE_PRESETS: { label: string; template: string }[] = [
  { label: "DuckDuckGo", template: "https://duckduckgo.com/?q={q}" },
  { label: "Google", template: "https://www.google.com/search?q={q}" },
  { label: "Bing", template: "https://www.bing.com/search?q={q}" },
  { label: "Startpage", template: "https://www.startpage.com/sp/search?query={q}" },
  { label: "Brave", template: "https://search.brave.com/search?q={q}" },
];

const THEME_OPTIONS = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
];

const TAB_LAYOUT_OPTIONS = [
  { label: "Top (Horizontal)", value: "horizontal" },
  { label: "Sidebar (Vertical)", value: "vertical" },
];

interface SettingsGeneralProps {
  draft: Settings;
  onUpdate: (patch: SettingsPatch) => void;
}

export default function SettingsGeneral({ draft, onUpdate }: SettingsGeneralProps) {
  const currentEngine =
    SEARCH_ENGINE_PRESETS.find((p) => p.template === draft.search_engine)?.template ??
    draft.search_engine;

  return (
    <VStack gap={4} align="stretch" style={{ width: "100%" }}>
      {/* Search & Navigation */}
      <Card padding={6} elevation="low" style={{ width: "100%" }}>
        <VStack gap={4} align="start" style={{ width: "100%" }}>
          <VStack gap={1} align="start">
            <Heading level={3}>Search & Navigation</Heading>
            <Text type="supporting" color="secondary">
              Configure your default search engine and browser home page.
            </Text>
          </VStack>
          <VStack gap={3} align="stretch" style={{ width: "100%" }}>
            <Selector
              label="Default search engine"
              value={currentEngine}
              options={SEARCH_ENGINE_PRESETS.map((p) => ({
                value: p.template,
                label: p.label,
              }))}
              onChange={(value) => onUpdate({ search_engine: value })}
            />
            <TextInput
              label="Home page"
              value={draft.home_page}
              onChange={(value) => onUpdate({ home_page: value })}
              placeholder="https://..."
              description="Opened by the home toolbar button and new window startup."
            />
          </VStack>
        </VStack>
      </Card>

      {/* Appearance */}
      <Card padding={6} elevation="low" style={{ width: "100%" }}>
        <VStack gap={4} align="start" style={{ width: "100%" }}>
          <VStack gap={1} align="start">
            <Heading level={3}>Appearance</Heading>
            <Text type="supporting" color="secondary">
              Customize colors, theme mode, and tab presentation.
            </Text>
          </VStack>
          <VStack gap={4} align="stretch" style={{ width: "100%" }}>
            <SegmentedControl
              label="Theme mode"
              value={draft.theme}
              onChange={(value) => onUpdate({ theme: value as ThemeMode })}
            >
              {THEME_OPTIONS.map((option) => (
                <SegmentedControlItem
                  key={option.value}
                  value={option.value}
                  label={option.label}
                />
              ))}
            </SegmentedControl>
            <SegmentedControl
              label="Tab layout"
              value={draft.tab_layout}
              onChange={(value) => onUpdate({ tab_layout: value as TabLayout })}
            >
              {TAB_LAYOUT_OPTIONS.map((option) => (
                <SegmentedControlItem
                  key={option.value}
                  value={option.value}
                  label={option.label}
                />
              ))}
            </SegmentedControl>
          </VStack>
        </VStack>
      </Card>

      {/* Startup & Session */}
      <Card padding={6} elevation="low" style={{ width: "100%" }}>
        <VStack gap={4} align="start" style={{ width: "100%" }}>
          <VStack gap={1} align="start">
            <Heading level={3}>Startup</Heading>
            <Text type="supporting" color="secondary">
              Control tab restoration when launching Rowster.
            </Text>
          </VStack>
          <Switch
            label="Restore previous session"
            description="Reopen the tabs that were open when Rowster last closed."
            value={draft.restore_session}
            onChange={(checked) => onUpdate({ restore_session: checked })}
          />
        </VStack>
      </Card>

      {/* Downloads Location */}
      <Card padding={6} elevation="low" style={{ width: "100%" }}>
        <VStack gap={4} align="start" style={{ width: "100%" }}>
          <VStack gap={1} align="start">
            <Heading level={3}>Downloads</Heading>
            <Text type="supporting" color="secondary">
              Choose where downloaded files are saved on your computer.
            </Text>
          </VStack>
          <VStack gap={3} align="stretch" style={{ width: "100%" }}>
            <Switch
              label="Ask where to save each file before downloading"
              description="When off, files will download automatically to the folder below."
              value={draft.ask_before_download}
              onChange={(checked) => onUpdate({ ask_before_download: checked })}
            />
            <TextInput
              label="Download folder path"
              value={draft.download_dir ?? ""}
              onChange={(value) => onUpdate({ download_dir: value })}
              placeholder="Default (System Downloads folder)"
              description="Leave blank to use the operating system default."
            />
          </VStack>
        </VStack>
      </Card>
    </VStack>
  );
}
