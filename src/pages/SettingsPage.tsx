import { useEffect, useState } from "react";
import { RotateCcw, Save, Settings as SettingsIcon, Shield, Sliders, TableProperties, UserCheck } from "lucide-react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Text } from "@astryxdesign/core/Text";
import {
  permissionsList,
  settingsGet,
  settingsSet,
} from "../ipc";
import type {
  AuthStatus,
  Settings,
  SettingsPatch,
  SitePermission,
} from "../types";
import BrowserPageLayout from "../components/common/BrowserPageLayout";
import SettingsGeneral from "./settings/SettingsGeneral";
import SettingsSecurity from "./settings/SettingsSecurity";
import SettingsTabs from "./settings/SettingsTabs";
import SettingsPrivacy from "./settings/SettingsPrivacy";

export interface SettingsPageProps {
  onClose: () => void;
  auth: AuthStatus;
  onAuthChange: (status: AuthStatus) => void;
}

type SettingsCategory = "general" | "security" | "tabs" | "privacy";

export default function SettingsPage({
  onClose,
  auth,
  onAuthChange,
}: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsCategory>("general");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [permissions, setPermissions] = useState<SitePermission[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSuccessToast, setSavedSuccessToast] = useState(false);

  useEffect(() => {
    let alive = true;
    void Promise.all([settingsGet(), permissionsList()])
      .then(([loadedSettings, loadedPermissions]) => {
        if (alive) {
          setSettings(loadedSettings);
          setDraft(loadedSettings);
          setPermissions(loadedPermissions);
        }
      })
      .catch((loadError: unknown) => {
        if (alive) setError(String(loadError));
      });
    return () => {
      alive = false;
    };
  }, []);

  const updateDraft = (patch: SettingsPatch) => {
    if (!draft) return;
    setDraft({ ...draft, ...patch });
    setError(null);
    setSavedSuccessToast(false);
  };

  const isDirty =
    settings !== null &&
    draft !== null &&
    JSON.stringify(settings) !== JSON.stringify(draft);

  const handleSave = () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    void settingsSet({ ...draft, download_dir: draft.download_dir ?? "" })
      .then((persisted) => {
        setSettings(persisted);
        setDraft(persisted);
        setSavedSuccessToast(true);
        window.dispatchEvent(
          new CustomEvent("rowster:settings-changed", { detail: persisted })
        );
        window.setTimeout(() => setSavedSuccessToast(false), 3500);
      })
      .catch((e: unknown) => {
        setError(String(e));
      })
      .finally(() => setSaving(false));
  };

  const handleRevert = () => {
    if (settings) {
      setDraft(settings);
      setError(null);
    }
  };

  const tabsContent = (
    <TabList
      value={activeTab}
      onChange={(value) => setActiveTab(value as SettingsCategory)}
      hasDivider
    >
      <Tab value="general" label="General" icon={<Sliders size={15} />} />
      <Tab value="security" label="Security & Sign-in" icon={<UserCheck size={15} />} />
      <Tab value="tabs" label="Tabs & Performance" icon={<TableProperties size={15} />} />
      <Tab value="privacy" label="Privacy & Permissions" icon={<Shield size={15} />} />
    </TabList>
  );

  const floatingBar = isDirty ? (
    <div className="settings-floating-save-bar">
      <HStack justify="between" align="center" style={{ width: "100%" }}>
        <Text type="label">You have unsaved changes</Text>
        <HStack gap={2} align="center">
          <Button
            label="Revert"
            variant="ghost"
            size="sm"
            icon={<RotateCcw size={14} />}
            isDisabled={saving}
            onClick={handleRevert}
          />
          <Button
            label="Save changes"
            variant="primary"
            size="sm"
            icon={<Save size={14} />}
            isLoading={saving}
            onClick={handleSave}
          />
        </HStack>
      </HStack>
    </div>
  ) : null;

  return (
    <BrowserPageLayout
      title="Settings"
      icon={<SettingsIcon size={20} />}
      subtitle="Preferences, security credentials, performance, and privacy"
      closeLabel="Close settings"
      onClose={onClose}
      tabs={tabsContent}
      floatingBar={floatingBar}
      isLoading={draft === null}
      loadingLabel="Loading Rowster settings..."
    >
      {error ? (
        <Banner
          status="error"
          title="Could not save settings"
          description={error}
          isDismissable
          onDismiss={() => setError(null)}
        />
      ) : null}

      {savedSuccessToast ? (
        <Banner
          status="success"
          title="Settings saved successfully."
          isDismissable
          onDismiss={() => setSavedSuccessToast(false)}
        />
      ) : null}

      {draft ? (
        activeTab === "general" ? (
          <SettingsGeneral draft={draft} onUpdate={updateDraft} />
        ) : activeTab === "security" ? (
          <SettingsSecurity auth={auth} onAuthChange={onAuthChange} />
        ) : activeTab === "tabs" ? (
          <SettingsTabs draft={draft} onUpdate={updateDraft} />
        ) : (
          <SettingsPrivacy
            draft={draft}
            onUpdate={updateDraft}
            permissions={permissions}
            onPermissionsChange={setPermissions}
          />
        )
      ) : null}
    </BrowserPageLayout>
  );
}
