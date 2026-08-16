import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import type { Settings, SettingsPatch } from "../../types";

interface SettingsTabsProps {
  draft: Settings;
  onUpdate: (patch: SettingsPatch) => void;
}

export default function SettingsTabs({ draft, onUpdate }: SettingsTabsProps) {
  const isSleepingEnabled = draft.tab_sleep_after_minutes > 0;

  return (
    <VStack gap={4} align="stretch" style={{ width: "100%" }}>
      {/* Tab Performance & Memory */}
      <Card padding={6} elevation="low" style={{ width: "100%" }}>
        <VStack gap={4} align="start" style={{ width: "100%" }}>
          <VStack gap={1} align="start">
            <Heading level={3}>Tab Resource Management</Heading>
            <Text type="supporting" color="secondary">
              Automatically hibernate inactive background tabs to save memory and CPU.
            </Text>
          </VStack>

          <VStack gap={3} align="stretch" style={{ width: "100%" }}>
            <Switch
              label="Sleep inactive background tabs"
              description="Hides and unloads WebViews you haven't viewed in a while. Tabs wake instantly when selected."
              value={isSleepingEnabled}
              onChange={(checked) =>
                onUpdate({ tab_sleep_after_minutes: checked ? 30 : 0 })
              }
            />

            {isSleepingEnabled ? (
              <TextInput
                label="Hibernate inactive tabs after (minutes)"
                value={String(draft.tab_sleep_after_minutes)}
                onChange={(value) => {
                  const minutes = Number.parseInt(value, 10);
                  if (Number.isFinite(minutes) && minutes > 0) {
                    onUpdate({ tab_sleep_after_minutes: minutes });
                  }
                }}
                description="The background cleanup sweeper runs every minute."
              />
            ) : null}
          </VStack>
        </VStack>
      </Card>

      {/* Safety & Form Protection */}
      <Card padding={6} elevation="low" style={{ width: "100%" }}>
        <VStack gap={4} align="start" style={{ width: "100%" }}>
          <VStack gap={1} align="start">
            <Heading level={3}>Tab Closing Safety</Heading>
            <Text type="supporting" color="secondary">
              Prevent accidental data loss when closing tabs.
            </Text>
          </VStack>

          <Switch
            label="Warn before closing a tab with unsaved form input"
            description="Displays a confirmation prompt if you close a tab where you have typed into forms."
            value={draft.warn_on_form_tabs}
            onChange={(checked) => onUpdate({ warn_on_form_tabs: checked })}
          />
        </VStack>
      </Card>
    </VStack>
  );
}
