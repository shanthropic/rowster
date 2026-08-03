import { useEffect, useState } from "react";
import { RotateCcw, Trash2, X } from "lucide-react";
import { Heading } from "@astryxdesign/core/Heading";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { Divider } from "@astryxdesign/core/Divider";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Button } from "@astryxdesign/core/Button";
import { List, ListItem } from "@astryxdesign/core/List";
import { Selector } from "@astryxdesign/core/Selector";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Switch } from "@astryxdesign/core/Switch";
import { TextInput } from "@astryxdesign/core/TextInput";
import { clearBrowsingData, permissionsList, permissionReset, permissionResetAll, settingsGet, settingsSet } from "../ipc";
import type { PermissionKind, Settings, SettingsPatch, SitePermission, ThemeMode } from "../types";

export interface SettingsPageProps {
  onClose: () => void;
}

const SEARCH_ENGINE_PRESETS: { label: string; template: string }[] = [
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

export default function SettingsPage({ onClose }: SettingsPageProps) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<SitePermission[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void settingsGet().then((loaded) => {
      if (!cancelled) {
        setSettings(loaded);
        setDraft(loaded);
      }
    });
    void permissionsList().then((loaded) => {
      if (!cancelled) setPermissions(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = (patch: SettingsPatch) => {
    if (!draft) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    setError(null);
    void settingsSet(patch)
      .then((persisted) => {
        setSettings(persisted);
        setDraft(persisted);
        setError(null);
      })
      .catch((e: unknown) => {
        setError(String(e));
        if (settings) setDraft(settings);
      });
  };

  const customEngine = draft
    ? SEARCH_ENGINE_PRESETS.some((p) => p.template === draft.search_engine)
      ? draft.search_engine
      : ""
    : "";

  const kindLabel = (kind: PermissionKind) =>
    kind === "camera"
      ? "Camera"
      : kind === "microphone"
        ? "Microphone"
        : kind === "geolocation"
          ? "Location"
          : "Notifications";

  const decisionLabel = (decision: SitePermission["decision"]) =>
    decision === "always_allow"
      ? "Always allow"
      : decision === "block"
        ? "Blocked"
        : "Allow once";

  const resetRow = (origin: string, kind: PermissionKind) => {
    void permissionReset(origin, kind).then(() => {
      setPermissions((current) =>
        current ? current.filter((p) => p.origin !== origin || p.kind !== kind) : current
      );
    });
  };

  const resetAll = () => {
    void permissionResetAll().then(() => setPermissions([]));
  };

  return (
    <VStack gap={4} align="center" style={{ height: "100%", overflowY: "auto", padding: "var(--spacing-8)" }}>
      <VStack gap={4} align="start" style={{ width: "60%" }}>
        <HStack gap={3} align="center" justify="between" style={{ width: "100%" }}>
          <Heading level={2}>Settings</Heading>
          <IconButton size="sm" variant="ghost" label="Close settings" icon={<X size={16} />} onClick={onClose} tooltip="Close (Esc)" />
        </HStack>
        <Divider />
        {error ? (
          <Text type="supporting" style={{ color: "var(--color-danger-base)" }}>
            {error}
          </Text>
        ) : null}

        {draft ? (
          <>
            <Section variant="transparent" padding={4}>
              <VStack gap={3} align="start">
                <Heading level={3}>Search</Heading>
                <Selector
                  label="Search engine"
                  value={customEngine}
                  options={SEARCH_ENGINE_PRESETS.map((p) => ({ value: p.template, label: p.label }))}
                  onChange={(value) => update({ search_engine: value })}
                />
                <TextInput
                  label="Home page"
                  value={draft.home_page}
                  onChange={(value) => update({ home_page: value })}
                  placeholder="https://"
                  description="Opened by the home button and the home new-tab behavior."
                />
              </VStack>
            </Section>
            <Divider />
            <Section variant="transparent" padding={4}>
              <VStack gap={3} align="start">
                <Heading level={3}>Appearance</Heading>
                <SegmentedControl
                  label="Theme"
                  value={draft.theme}
                  onChange={(value) => update({ theme: value as ThemeMode })}
                >
                  {THEME_OPTIONS.map((option) => (
                    <SegmentedControlItem key={option.value} value={option.value} label={option.label} />
                  ))}
                </SegmentedControl>
              </VStack>
            </Section>
            <Divider />
            <Section variant="transparent" padding={4}>
              <VStack gap={3} align="start">
                <Heading level={3}>Startup</Heading>
                <Switch
                  label="Restore the previous session"
                  description="Reopen the tabs that were open when Rowster last closed."
                  value={draft.restore_session}
                  onChange={(checked) => update({ restore_session: checked })}
                />
              </VStack>
            </Section>
            <Divider />
            <Section variant="transparent" padding={4}>
              <VStack gap={3} align="start">
                <Heading level={3}>Downloads</Heading>
                <Switch
                  label="Ask where to save each file"
                  description="Off to download straight to the folder below."
                  value={draft.ask_before_download}
                  onChange={(checked) => update({ ask_before_download: checked })}
                />
                <TextInput
                  label="Download folder"
                  value={draft.download_dir ?? ""}
                  onChange={(value) => update({ download_dir: value })}
                  placeholder="Default (system downloads)"
                  description="Absolute path; empty means the system default."
                />
              </VStack>
            </Section>
            <Divider />
            <Section variant="transparent" padding={4}>
              <VStack gap={3} align="start">
                <Heading level={3}>Tabs</Heading>
                <Switch
                  label="Sleep inactive tabs"
                  description="Free up resources by hiding tabs you haven't used in a while. They wake when selected."
                  value={draft.tab_sleep_after_minutes > 0}
                  onChange={(checked) => update({ tab_sleep_after_minutes: checked ? 30 : 0 })}
                />
                <TextInput
                  label="Sleep after (minutes)"
                  value={String(draft.tab_sleep_after_minutes)}
                  onChange={(value) => {
                    const minutes = Number.parseInt(value, 10);
                    if (Number.isFinite(minutes)) update({ tab_sleep_after_minutes: minutes });
                  }}
                  description="0 disables automatic sleeping. The sweeper checks every minute."
                />
                <Switch
                  label="Warn before closing a tab with unsaved form input"
                  description="Ask for confirmation when a tab has edited form fields."
                  value={draft.warn_on_form_tabs}
                  onChange={(checked) => update({ warn_on_form_tabs: checked })}
                />
              </VStack>
            </Section>
            <Divider />
            <Section variant="transparent" padding={4}>
              <VStack gap={3} align="start">
                <Heading level={3}>Privacy</Heading>
                <TextInput
                  label="History retention"
                  value={String(draft.history_retention_days)}
                  onChange={(value) => {
                    const days = Number.parseInt(value, 10);
                    if (Number.isFinite(days)) update({ history_retention_days: days });
                  }}
                  description="Days to keep browsing history (0 keeps everything)."
                />
                <VStack gap={2} align="start">
                  <Text type="label">Clear browsing data</Text>
                  <HStack gap={2} align="center" wrap="wrap">
                    <Button
                      label="History"
                      size="sm"
                      variant="secondary"
                      onClick={() => void clearBrowsingData(["history"])}
                    />
                    <Button
                      label="Bookmarks"
                      size="sm"
                      variant="secondary"
                      onClick={() => void clearBrowsingData(["bookmarks"])}
                    />
                    <Button
                      label="Downloads"
                      size="sm"
                      variant="secondary"
                      onClick={() => void clearBrowsingData(["downloads"])}
                    />
                  </HStack>
                </VStack>
              </VStack>
            </Section>
            <Divider />
            <Section variant="transparent" padding={4}>
              <VStack gap={3} align="start" style={{ width: "100%" }}>
                <HStack gap={3} justify="between" align="center" style={{ width: "100%" }}>
                  <Heading level={3}>Permissions</Heading>
                  {permissions && permissions.length > 0 ? (
                    <Button
                      label="Reset all"
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 size={14} />}
                      onClick={resetAll}
                    />
                  ) : null}
                </HStack>
                <Text type="supporting" color="secondary">
                  Stored choices for camera, microphone, location and
                  notification requests. New sites always ask first.
                </Text>
                {permissions && permissions.length > 0 ? (
                  <List hasDividers density="compact" style={{ width: "100%" }}>
                    {permissions.map((permission) => (
                      <ListItem
                        key={`${permission.origin}:${permission.kind}`}
                        label={permission.origin}
                        description={`${kindLabel(permission.kind)} — ${decisionLabel(permission.decision)}`}
                        endContent={
                          <IconButton
                            size="sm"
                            variant="ghost"
                            label={`Reset ${permission.origin} ${kindLabel(permission.kind).toLowerCase()}`}
                            icon={<RotateCcw size={14} />}
                            tooltip="Reset"
                            onClick={() => resetRow(permission.origin, permission.kind)}
                          />
                        }
                      />
                    ))}
                  </List>
                ) : permissions ? (
                  <Text type="supporting" color="secondary">
                    No saved permissions yet.
                  </Text>
                ) : null}
              </VStack>
            </Section>
          </>
        ) : null}
      </VStack>
    </VStack>
  );
}
