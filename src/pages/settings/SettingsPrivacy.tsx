import { useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { List, ListItem } from "@astryxdesign/core/List";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import {
  clearBrowsingData,
  permissionReset,
  permissionResetAll,
} from "../../ipc";
import type { PermissionKind, Settings, SettingsPatch, SitePermission } from "../../types";

interface SettingsPrivacyProps {
  draft: Settings;
  onUpdate: (patch: SettingsPatch) => void;
  permissions: SitePermission[] | null;
  onPermissionsChange: (perms: SitePermission[]) => void;
}

export default function SettingsPrivacy({
  draft,
  onUpdate,
  permissions,
  onPermissionsChange,
}: SettingsPrivacyProps) {
  const [clearing, setClearing] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isResetAllDialogOpen, setIsResetAllDialogOpen] = useState(false);

  const handleClear = (type: "history" | "bookmarks" | "downloads", label: string) => {
    setClearing(type);
    setErrorMessage(null);
    setStatusMessage(null);
    void clearBrowsingData([type])
      .then(() => {
        setStatusMessage(`Cleared ${label} successfully.`);
      })
      .catch((err: unknown) => {
        setErrorMessage(String(err));
      })
      .finally(() => setClearing(null));
  };

  const handleResetPermission = (origin: string, kind: PermissionKind) => {
    void permissionReset(origin, kind)
      .then(() => {
        onPermissionsChange(
          (permissions ?? []).filter(
            (p) => p.origin !== origin || p.kind !== kind
          )
        );
      })
      .catch((err: unknown) => setErrorMessage(String(err)));
  };

  const handleResetAllPermissions = () => {
    void permissionResetAll()
      .then(() => {
        onPermissionsChange([]);
        setIsResetAllDialogOpen(false);
        setStatusMessage("Reset all site permissions.");
      })
      .catch((err: unknown) => setErrorMessage(String(err)));
  };

  const kindLabel = (kind: PermissionKind) => {
    switch (kind) {
      case "camera":
        return "Camera";
      case "microphone":
        return "Microphone";
      case "geolocation":
        return "Location";
      case "notifications":
        return "Notifications";
    }
  };

  const decisionToken = (decision: SitePermission["decision"]) => {
    switch (decision) {
      case "always_allow":
        return <Token label="Allowed" color="green" size="sm" />;
      case "block":
        return <Token label="Blocked" color="red" size="sm" />;
      case "allow_once":
        return <Token label="Once" color="blue" size="sm" />;
    }
  };

  return (
    <VStack gap={4} align="stretch" style={{ width: "100%" }}>
      {errorMessage ? (
        <Banner
          status="error"
          title="Privacy action error"
          description={errorMessage}
          isDismissable
          onDismiss={() => setErrorMessage(null)}
        />
      ) : null}

      {statusMessage ? (
        <Banner
          status="success"
          title={statusMessage}
          isDismissable
          onDismiss={() => setStatusMessage(null)}
        />
      ) : null}

      {/* History Retention */}
      <Card padding={6} elevation="low" style={{ width: "100%" }}>
        <VStack gap={4} align="start" style={{ width: "100%" }}>
          <VStack gap={1} align="start">
            <Heading level={3}>History Retention</Heading>
            <Text type="supporting" color="secondary">
              Set how long browsing visits are kept locally before automatic deletion.
            </Text>
          </VStack>
          <TextInput
            label="Retention period (days)"
            value={String(draft.history_retention_days)}
            onChange={(value) => {
              const days = Number.parseInt(value, 10);
              if (Number.isFinite(days) && days >= 0) {
                onUpdate({ history_retention_days: days });
              }
            }}
            description="Enter 0 to retain browsing history indefinitely."
          />
        </VStack>
      </Card>

      {/* Clear Browsing Data */}
      <Card padding={6} elevation="low" style={{ width: "100%" }}>
        <VStack gap={4} align="start" style={{ width: "100%" }}>
          <VStack gap={1} align="start">
            <Heading level={3}>Clear Browsing Data</Heading>
            <Text type="supporting" color="secondary">
              Instantly purge specific stored local records.
            </Text>
          </VStack>

          <HStack gap={3} wrap="wrap">
            <Button
              label="Clear History"
              variant="secondary"
              size="sm"
              icon={<Trash2 size={14} />}
              isLoading={clearing === "history"}
              onClick={() => handleClear("history", "browsing history")}
            />
            <Button
              label="Clear Bookmarks"
              variant="secondary"
              size="sm"
              icon={<Trash2 size={14} />}
              isLoading={clearing === "bookmarks"}
              onClick={() => handleClear("bookmarks", "bookmarks")}
            />
            <Button
              label="Clear Downloads"
              variant="secondary"
              size="sm"
              icon={<Trash2 size={14} />}
              isLoading={clearing === "downloads"}
              onClick={() => handleClear("downloads", "downloads list")}
            />
          </HStack>
        </VStack>
      </Card>

      {/* Site Permissions */}
      <Card padding={6} elevation="low" style={{ width: "100%" }}>
        <VStack gap={4} align="start" style={{ width: "100%" }}>
          <HStack justify="between" align="center" style={{ width: "100%" }}>
            <VStack gap={1} align="start">
              <Heading level={3}>Site Permissions</Heading>
              <Text type="supporting" color="secondary">
                Saved choices for camera, microphone, location, and notifications.
              </Text>
            </VStack>
            {permissions && permissions.length > 0 ? (
              <Button
                label="Reset all"
                variant="ghost"
                size="sm"
                icon={<Trash2 size={14} />}
                onClick={() => setIsResetAllDialogOpen(true)}
              />
            ) : null}
          </HStack>

          {permissions && permissions.length > 0 ? (
            <List hasDividers density="compact" style={{ width: "100%" }}>
              {permissions.map((permission) => (
                <ListItem
                  key={`${permission.origin}:${permission.kind}`}
                  label={permission.origin}
                  description={
                    <HStack gap={2} align="center">
                      <Text type="supporting" size="sm">
                        {kindLabel(permission.kind)}
                      </Text>
                      {decisionToken(permission.decision)}
                    </HStack>
                  }
                  endContent={
                    <IconButton
                      size="sm"
                      variant="ghost"
                      label={`Reset ${permission.origin} ${kindLabel(permission.kind).toLowerCase()}`}
                      icon={<RotateCcw size={14} />}
                      tooltip="Reset permission"
                      onClick={() =>
                        handleResetPermission(permission.origin, permission.kind)
                      }
                    />
                  }
                />
              ))}
            </List>
          ) : (
            <Text type="supporting" color="secondary">
              No saved site permissions yet. Sites will prompt you when requesting access.
            </Text>
          )}
        </VStack>
      </Card>

      {/* Reset All Permissions AlertDialog */}
      <AlertDialog
        isOpen={isResetAllDialogOpen}
        onOpenChange={setIsResetAllDialogOpen}
        title="Reset all site permissions?"
        description="This will clear all saved permissions for camera, microphone, location, and notifications. Sites will prompt for permission again upon your next visit."
        actionLabel="Reset all permissions"
        actionVariant="destructive"
        onAction={handleResetAllPermissions}
      />
    </VStack>
  );
}
