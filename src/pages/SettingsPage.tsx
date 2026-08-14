import { useEffect, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
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
import { Banner } from "@astryxdesign/core/Banner";
import { clearBrowsingData, permissionsList, permissionReset, permissionResetAll, settingsGet, settingsSet } from "../ipc";
import type { AuthStatus, PermissionKind, Settings, SettingsPatch, SitePermission, TabLayout, ThemeMode } from "../types";
import SignInSettings from "../components/SignInSettings";
import BrowserPage from "../components/BrowserPage";

export interface SettingsPageProps {
  onClose: () => void;
  auth: AuthStatus;
  onAuthChange: (status: AuthStatus) => void;
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

const TAB_LAYOUT_OPTIONS = [
  { label: "Top (Horizontal)", value: "horizontal" },
  { label: "Sidebar (Vertical)", value: "vertical" },
];

export default function SettingsPage({ onClose, auth, onAuthChange }: SettingsPageProps) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<SitePermission[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([settingsGet(), permissionsList()])
      .then(([loadedSettings, loadedPermissions]) => {
        if (!cancelled) {
          setSettings(loadedSettings);
          setDraft(loadedSettings);
          setPermissions(loadedPermissions);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(String(loadError));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = (patch: SettingsPatch) => {
    if (!draft) return;
    setDraft({ ...draft, ...patch });
    setError(null);
  };

  const save = () => {
    if (!draft) return;
    setSaving(true);
    void settingsSet({ ...draft, download_dir: draft.download_dir ?? "" })
      .then((persisted) => {
        setSettings(persisted);
        setDraft(persisted);
        setError(null);
        window.dispatchEvent(
          new CustomEvent("rowster:settings-changed", { detail: persisted })
        );
      })
      .catch((e: unknown) => {
        setError(String(e));
      })
      .finally(() => setSaving(false));
  };

  const isDirty = settings !== null && draft !== null && JSON.stringify(settings) !== JSON.stringify(draft);

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
    void permissionReset(origin, kind)
      .then(() => {
        setPermissions((current) =>
          current ? current.filter((p) => p.origin !== origin || p.kind !== kind) : current
        );
      })
      .catch((resetError: unknown) => setError(String(resetError)));
  };

  const resetAll = () => {
    void permissionResetAll()
      .then(() => setPermissions([]))
      .catch((resetError: unknown) => setError(String(resetError)));
  };

  return (
    <BrowserPage
      title="Settings"
      closeLabel="Close settings"
      onClose={onClose}
      width="standard"
      actions={
        <>
            <Button
              label="Reset"
              variant="ghost"
              size="sm"
              isDisabled={!isDirty || saving}
              onClick={() => settings && setDraft(settings)}
            />
            <Button
              label="Save changes"
              variant="primary"
              size="sm"
              isDisabled={!isDirty}
              isLoading={saving}
              onClick={save}
            />
        </>
      }
    >
        {error ? (
          <Banner
            status="error"
            title="Settings were not saved"
            description={error}
            isDismissable
            onDismiss={() => setError(null)}
          />
        ) : null}

        {draft ? (
          <>
            <SignInSettings auth={auth} onAuthChange={onAuthChange} />
            <Divider />
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
                <SegmentedControl
                  label="Tab layout"
                  value={draft.tab_layout}
                  onChange={(value) => update({ tab_layout: value as TabLayout })}
                >
                  {TAB_LAYOUT_OPTIONS.map((option) => (
                    <SegmentedControlItem key={option.value} value={option.value} label={option.label} />
                  ))}
                </SegmentedControl>
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
                      onClick={() => {
                        void clearBrowsingData(["history"]).catch((clearError: unknown) => setError(String(clearError)));
                      }}
                    />
                    <Button
                      label="Bookmarks"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        void clearBrowsingData(["bookmarks"]).catch((clearError: unknown) => setError(String(clearError)));
                      }}
                    />
                    <Button
                      label="Downloads"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        void clearBrowsingData(["downloads"]).catch((clearError: unknown) => setError(String(clearError)));
                      }}
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
    </BrowserPage>
  );
}
