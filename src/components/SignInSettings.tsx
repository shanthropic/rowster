import { useState } from "react";
import { KeyRound, Save } from "lucide-react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Divider } from "@astryxdesign/core/Divider";
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
} from "../ipc";
import type { AuthStatus } from "../types";

interface SignInSettingsProps {
  auth: AuthStatus;
  onAuthChange: (status: AuthStatus) => void;
}

export default function SignInSettings({ auth, onAuthChange }: SignInSettingsProps) {
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
    message: string,
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
      authSetPassword(auth.password_configured ? currentPassword : null, newPassword),
      auth.password_configured ? "Password changed." : "Password protection enabled.",
    );
  };

  const togglePasskey = () => {
    run(
      "passkey",
      authSetPasskey(!auth.passkey_configured, currentPassword),
      auth.passkey_configured ? "Passkey sign-in disabled." : "Passkey sign-in enabled.",
    );
  };

  return (
    <Section variant="transparent" padding={4}>
      <VStack gap={4} align="start" style={{ width: "100%" }}>
        <VStack gap={1} align="start">
          <Heading level={3}>Sign-in</Heading>
          <Text type="supporting" color="secondary">
            Control the name on your welcome screen and how Rowster unlocks at startup.
          </Text>
        </VStack>

        {error ? (
          <Banner
            status="error"
            title="Sign-in settings were not changed"
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

        <VStack gap={3} align="stretch" style={{ width: "100%" }}>
          <TextInput
            label="Welcome name"
            value={name}
            onChange={setName}
            description="Shown on the New Tab and unlock screens."
          />
          <Button
            label="Save name"
            variant="secondary"
            size="sm"
            icon={<Save size={14} />}
            isDisabled={!name.trim() || name.trim() === auth.name}
            isLoading={busy === "name"}
            onClick={() => run("name", authUpdateName(name), "Welcome name updated.")}
          />
        </VStack>

        <Divider />

        <VStack gap={3} align="stretch" style={{ width: "100%" }}>
          <Heading level={4}>
            {auth.password_configured ? "Change password" : "Create a password"}
          </Heading>
          {auth.password_configured ? (
            <TextInput
              type="password"
              label="Current password"
              value={currentPassword}
              onChange={setCurrentPassword}
            />
          ) : null}
          <TextInput
            type="password"
            label="New password"
            value={newPassword}
            onChange={setNewPassword}
            description="Use at least 8 characters. Only an Argon2id hash is stored."
          />
          <TextInput
            type="password"
            label="Confirm new password"
            value={confirmation}
            onChange={setConfirmation}
          />
          <Button
            label={auth.password_configured ? "Change password" : "Enable password protection"}
            variant="secondary"
            size="sm"
            isDisabled={
              !newPassword ||
              !confirmation ||
              (auth.password_configured && !currentPassword)
            }
            isLoading={busy === "password"}
            onClick={savePassword}
          />
        </VStack>

        <Divider />

        <HStack gap={4} align="center" justify="between" style={{ width: "100%" }} wrap="wrap">
          <VStack gap={1} align="start">
            <Heading level={4}>Device passkey</Heading>
            <Text type="supporting" color="secondary">
              {auth.password_configured
                ? auth.passkey_available
                  ? "Use Windows Hello to unlock with your device PIN, face, or fingerprint."
                  : "Native device authentication is not available on this system."
                : "Create a password before configuring a passkey."}
            </Text>
          </VStack>
          <Button
            label={auth.passkey_configured ? "Disable passkey" : "Set up passkey"}
            variant="secondary"
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
      </VStack>
    </Section>
  );
}
