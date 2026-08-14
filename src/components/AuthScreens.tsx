import { useState, type FormEvent, type ReactNode } from "react";
import { KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Section } from "@astryxdesign/core/Section";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StackItem } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import type { AuthStatus } from "../types";
import {
  authCompleteOnboarding,
  authStatus,
  authUnlockPasskey,
  authUnlockPassword,
} from "../ipc";
import { WindowControls } from "./TitleBar";
import MaterialClock from "./NewTab/MaterialClock";

interface AuthScreenProps {
  status: AuthStatus | null;
  loadError: string | null;
  onAuthenticated: (status: AuthStatus) => void;
  onRetry: () => void;
}

interface AuthShellProps {
  children: ReactNode;
}

function AuthShell({ children }: AuthShellProps) {
  return (
    <VStack gap={0} className="auth-shell">
      <HStack
        gap={0}
        paddingInline={1}
        align="center"
        className="auth-titlebar"
        data-tauri-drag-region
      >
        <StackItem size="fill" />
        <WindowControls />
      </HStack>
      <StackItem size="fill">{children}</StackItem>
    </VStack>
  );
}

export default function AuthScreens({
  status,
  loadError,
  onAuthenticated,
  onRetry,
}: AuthScreenProps) {
  if (loadError) {
    return (
      <AuthShell>
        <Center height="100%" padding={6}>
          <VStack gap={4} align="center">
            <Banner
              status="error"
              title="Rowster could not check sign-in"
              description={loadError}
            />
            <Button label="Try again" variant="primary" onClick={onRetry} />
          </VStack>
        </Center>
      </AuthShell>
    );
  }

  if (!status) {
    return (
      <AuthShell>
        <Center height="100%">
          <Spinner size="md" aria-label="Checking Rowster sign-in" />
        </Center>
      </AuthShell>
    );
  }

  return status.phase === "onboarding" ? (
    <OnboardingScreen status={status} onAuthenticated={onAuthenticated} />
  ) : (
    <UnlockScreen status={status} onAuthenticated={onAuthenticated} />
  );
}

interface FlowProps {
  status: AuthStatus;
  onAuthenticated: (status: AuthStatus) => void;
}

function OnboardingScreen({ status, onAuthenticated }: FlowProps) {
  const [step, setStep] = useState<"name" | "password" | "passkey">("name");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const complete = (enablePasskey: boolean, selectedPassword: string | null) => {
    setBusy(true);
    setError(null);
    void authCompleteOnboarding(name.trim(), selectedPassword, enablePasskey)
      .then(onAuthenticated)
      .catch(async (reason: unknown) => {
        // Authentication may have committed even if browser startup hit a
        // recoverable engine error. Re-read Rust state instead of replaying setup.
        try {
          const current = await authStatus();
          if (current.phase === "unlocked") {
            onAuthenticated(current);
            return;
          }
        } catch {
          // Preserve the original, more useful operation error below.
        }
        setError(String(reason));
      })
      .finally(() => setBusy(false));
  };

  const continueFromPassword = () => {
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setError(null);
    setStep("passkey");
  };

  return (
    <AuthShell>
      <Center height="100%" padding={6}>
        <Card maxWidth={480} width="100%" padding={8} elevation="low">
          <VStack gap={5} align="start">
            <VStack gap={2} align="start">
              <Text type="supporting" color="secondary">
                {step === "name" ? "Step 1 of 3" : step === "password" ? "Step 2 of 3" : "Step 3 of 3"}
              </Text>
              <Heading level={1}>
                {step === "name"
                  ? "Welcome to Rowster"
                  : step === "password"
                    ? "Protect your browser"
                    : "Use your device passkey"}
              </Heading>
              <Text type="body" color="secondary">
                {step === "name"
                  ? "Tell us what to call you on the New Tab and welcome screens."
                  : step === "password"
                    ? "A password protects your tabs and browser data whenever Rowster starts."
                    : "Windows Hello can unlock Rowster with your device PIN, face, or fingerprint."}
              </Text>
            </VStack>

            {error ? (
              <Banner status="error" title="Could not continue" description={error} />
            ) : null}

            {step === "name" ? (
              <form
                className="auth-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (name.trim()) setStep("password");
                }}
              >
                <VStack gap={4} align="stretch">
                  <TextInput
                    label="Your name"
                    value={name}
                    onChange={setName}
                    hasAutoFocus
                    isRequired
                    placeholder="How should Rowster greet you?"
                  />
                  <Button
                    type="submit"
                    label="Continue"
                    variant="primary"
                    width="100%"
                    isDisabled={!name.trim()}
                  />
                </VStack>
              </form>
            ) : step === "password" ? (
              <form
                className="auth-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  continueFromPassword();
                }}
              >
                <VStack gap={4} align="stretch">
                  <TextInput
                    type="password"
                    label="Create password"
                    value={password}
                    onChange={setPassword}
                    hasAutoFocus
                    description="Use at least 8 characters. Rowster stores only an Argon2id hash."
                  />
                  <TextInput
                    type="password"
                    label="Confirm password"
                    value={confirmation}
                    onChange={setConfirmation}
                  />
                  <Button
                    type="submit"
                    label="Create password"
                    variant="primary"
                    width="100%"
                  />
                  <Button
                    label="Skip password"
                    variant="ghost"
                    width="100%"
                    isLoading={busy}
                    onClick={() => complete(false, null)}
                  />
                </VStack>
              </form>
            ) : (
              <VStack gap={4} align="stretch" className="auth-form">
                <Section variant="muted" padding={4}>
                  <HStack gap={3} align="center">
                    <ShieldCheck aria-hidden="true" />
                    <VStack gap={1} align="start">
                      <Text type="label">Native device verification</Text>
                      <Text type="supporting" color="secondary">
                        Your biometric data and device credential stay with the operating system.
                      </Text>
                    </VStack>
                  </HStack>
                </Section>
                <Button
                  label={status.passkey_available ? "Set up passkey" : "Passkey unavailable"}
                  variant="primary"
                  width="100%"
                  icon={<KeyRound size={18} />}
                  isDisabled={!status.passkey_available}
                  isLoading={busy}
                  onClick={() => complete(true, password)}
                />
                <Button
                  label="Skip passkey"
                  variant="ghost"
                  width="100%"
                  isDisabled={busy}
                  onClick={() => complete(false, password)}
                />
              </VStack>
            )}
          </VStack>
        </Card>
      </Center>
    </AuthShell>
  );
}

function UnlockScreen({ status, onAuthenticated }: FlowProps) {
  const [usePassword, setUsePassword] = useState(!status.passkey_configured);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runUnlock = (task: Promise<AuthStatus>) => {
    setBusy(true);
    setError(null);
    void task
      .then(onAuthenticated)
      .catch(async (reason: unknown) => {
        try {
          const current = await authStatus();
          if (current.phase === "unlocked") {
            onAuthenticated(current);
            return;
          }
        } catch {
          // Preserve the unlock error.
        }
        setError(String(reason));
      })
      .finally(() => setBusy(false));
  };

  const submitPassword = (event: FormEvent) => {
    event.preventDefault();
    if (password) runUnlock(authUnlockPassword(password));
  };

  return (
    <AuthShell>
      <Section variant="transparent" padding={0} className="auth-unlock-viewport">
        <Center height="100%" width="100%" padding={6}>
          <HStack gap={10} align="center" justify="center" wrap="wrap" className="auth-unlock-layout">
            <MaterialClock userName={status.name ?? "there"} />
            <Card width={440} maxWidth="100%" padding={8} elevation="low">
              <VStack gap={5} align="stretch">
                <VStack gap={2} align="start">
                  <Heading level={1}>Welcome back</Heading>
                  <Text type="body" color="secondary">
                    Sign in to restore your tabs and open your browser data.
                  </Text>
                </VStack>
                {error ? (
                  <Banner
                    status="error"
                    title="Rowster stayed locked"
                    description={error}
                  />
                ) : null}
                {!usePassword && status.passkey_configured ? (
                  <VStack gap={3} align="stretch">
                    <Button
                      label="Unlock with passkey"
                      variant="primary"
                      size="lg"
                      width="100%"
                      icon={<KeyRound size={20} />}
                      isLoading={busy}
                      onClick={() => runUnlock(authUnlockPasskey())}
                    />
                    <Button
                      label="Use password instead"
                      variant="ghost"
                      size="sm"
                      width="100%"
                      isDisabled={busy}
                      onClick={() => {
                        setError(null);
                        setUsePassword(true);
                      }}
                    />
                  </VStack>
                ) : (
                  <form className="auth-form" onSubmit={submitPassword}>
                    <VStack gap={4} align="stretch">
                      <TextInput
                        type="password"
                        label="Password"
                        value={password}
                        onChange={setPassword}
                        hasAutoFocus
                        startIcon="lock"
                      />
                      <Button
                        type="submit"
                        label="Unlock Rowster"
                        variant="primary"
                        size="lg"
                        width="100%"
                        icon={<LockKeyhole size={20} />}
                        isDisabled={!password}
                        isLoading={busy}
                      />
                      {status.passkey_configured ? (
                        <Button
                          label="Use passkey instead"
                          variant="ghost"
                          size="sm"
                          width="100%"
                          isDisabled={busy}
                          onClick={() => {
                            setError(null);
                            setUsePassword(false);
                          }}
                        />
                      ) : null}
                    </VStack>
                  </form>
                )}
              </VStack>
            </Card>
          </HStack>
        </Center>
      </Section>
    </AuthShell>
  );
}
