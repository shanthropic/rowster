import { useState } from "react";
import { KeyRound, Lock, Save, ShieldCheck, User } from "lucide-react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import {
  authSetPasskey,
  authSetPassword,
  authUpdateName,
} from "../../ipc";
import type { AuthStatus } from "../../types";

interface SettingsSecurityProps {
  auth: AuthStatus;
  onAuthChange: (status: AuthStatus) => void;
}

export default function SettingsSecurity({
  auth,
  onAuthChange,
}: SettingsSecurityProps) {
  const [name, setName] = useState(auth.name ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState<"name" | "password" | "passkey" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const run = (
    operation: "name" | "password" | "passkey",
    task: Promise<AuthStatus>,
    message: string
  ) => {
    setBusy(operation);
    setError(null);
    setSuccess(null);
    void task
      .then((status) => {
        onAuthChange(status);
        setSuccess(message);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmation("");
      })
      .catch((reason: unknown) => setError(String(reason)))
      .finally(() => setBusy(null));
  };

  const savePassword = () => {
    if (newPassword.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    if (newPassword !== confirmation) {
      setError("The new passwords do not match.");
      return;
    }
    run(
      "password",
      authSetPassword(
        auth.password_configured ? currentPassword : null,
        newPassword
      ),
      auth.password_configured
        ? "Password changed successfully."
        : "Master password enabled."
    );
  };

  const togglePasskey = () => {
    run(
      "passkey",
      authSetPasskey(!auth.passkey_configured, currentPassword),
      auth.passkey_configured
        ? "Device passkey sign-in disabled."
        : "Windows Hello passkey configured."
    );
  };

  return (
    <VStack gap={4} align="stretch" style={{ width: "100%" }}>
      {error ? (
        <Banner
          status="error"
          title="Security action failed"
          description={error}
          isDismissable
          onDismiss={() => setError(null)}
        />
      ) : null}

      {success ? (
        <Banner
          status="success"
          title={success}
          isDismissable
          onDismiss={() => setSuccess(null)}
        />
      ) : null}

      {/* User Profile & Greeting */}
      <Card padding={6} elevation="low" style={{ width: "100%" }}>
        <VStack gap={4} align="start" style={{ width: "100%" }}>
          <VStack gap={1} align="start">
            <Heading level={3}>Welcome Profile</Heading>
            <Text type="supporting" color="secondary">
              Personalize the greeting displayed on your New Tab and startup screens.
            </Text>
          </VStack>
          <VStack gap={3} align="stretch" style={{ width: "100%" }}>
            <TextInput
              label="Display Name"
              value={name}
              onChange={setName}
              placeholder="e.g. Alex"
              startIcon={<User size={16} />}
              description="Shown as 'Hi there, {Name}' on the clock widget."
            />
            <HStack justify="end">
              <Button
                label="Save Name"
                variant="primary"
                size="sm"
                icon={<Save size={14} />}
                isDisabled={!name.trim() || name.trim() === auth.name}
                isLoading={busy === "name"}
                onClick={() =>
                  run("name", authUpdateName(name), "Welcome name updated.")
                }
              />
            </HStack>
          </VStack>
        </VStack>
      </Card>

      {/* Master Password Protection */}
      <Card padding={6} elevation="low" style={{ width: "100%" }}>
        <VStack gap={4} align="start" style={{ width: "100%" }}>
          <VStack gap={1} align="start">
            <Heading level={3}>
              {auth.password_configured
                ? "Change Master Password"
                : "Enable Password Protection"}
            </Heading>
            <Text type="supporting" color="secondary">
              A master password locks your tabs, history, and browser credentials
              at startup. Only an Argon2id hash is stored locally.
            </Text>
          </VStack>

          <VStack gap={3} align="stretch" style={{ width: "100%" }}>
            {auth.password_configured ? (
              <TextInput
                type="password"
                label="Current Password"
                value={currentPassword}
                onChange={setCurrentPassword}
                startIcon={<Lock size={16} />}
              />
            ) : null}
            <TextInput
              type="password"
              label="New Password"
              value={newPassword}
              onChange={setNewPassword}
              startIcon={<Lock size={16} />}
              description="Minimum 8 characters."
            />
            <TextInput
              type="password"
              label="Confirm New Password"
              value={confirmation}
              onChange={setConfirmation}
              startIcon={<Lock size={16} />}
            />
            <HStack justify="end">
              <Button
                label={
                  auth.password_configured
                    ? "Update Password"
                    : "Create Password"
                }
                variant="primary"
                size="sm"
                isDisabled={
                  !newPassword ||
                  !confirmation ||
                  (auth.password_configured && !currentPassword)
                }
                isLoading={busy === "password"}
                onClick={savePassword}
              />
            </HStack>
          </VStack>
        </VStack>
      </Card>

      {/* Windows Hello Passkey */}
      <Card padding={6} elevation="low" style={{ width: "100%" }}>
        <VStack gap={4} align="start" style={{ width: "100%" }}>
          <VStack gap={1} align="start">
            <Heading level={3}>Windows Hello Passkey</Heading>
            <Text type="supporting" color="secondary">
              Unlock Rowster instantly using your native device PIN, face, or
              fingerprint verification.
            </Text>
          </VStack>

          <Section
            variant="muted"
            padding={4}
            style={{ borderRadius: "var(--radius-lg)", width: "100%" }}
          >
            <HStack gap={3} align="center">
              <ShieldCheck
                size={20}
                color="var(--color-text-cyan)"
                aria-hidden="true"
              />
              <VStack gap={0} align="start">
                <Text type="label">Hardware-Backed Security</Text>
                <Text type="supporting" color="secondary">
                  {auth.password_configured
                    ? auth.passkey_available
                      ? auth.passkey_configured
                        ? "Passkey is active and ready to unlock on startup."
                        : "Passkey is available on this system."
                      : "Native biometric verification is not available on this device."
                    : "You must create a master password before enabling passkey."}
                </Text>
              </VStack>
            </HStack>
          </Section>

          <HStack justify="end" style={{ width: "100%" }}>
            <Button
              label={
                auth.passkey_configured
                  ? "Disable Passkey"
                  : "Set Up Passkey"
              }
              variant={auth.passkey_configured ? "destructive" : "primary"}
              size="sm"
              icon={<KeyRound size={14} />}
              isDisabled={
                !auth.password_configured ||
                (!auth.passkey_configured && !auth.passkey_available) ||
                !currentPassword
              }
              isLoading={busy === "passkey"}
              onClick={togglePasskey}
            />
          </HStack>
          {!currentPassword && auth.password_configured ? (
            <Text type="supporting" color="secondary" size="sm">
              * Enter your current password above to change passkey settings.
            </Text>
          ) : null}
        </VStack>
      </Card>
    </VStack>
  );
}
