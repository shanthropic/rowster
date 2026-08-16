import { useState, type FormEvent, type ReactNode } from "react";
import { KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { Banner } from "@astryxdesign/core/Banner";
import { Center } from "@astryxdesign/core/Center";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Section } from "@astryxdesign/core/Section";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StackItem } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { RowsterIcon } from "./common/RowsterIcon";
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
            <button
              type="button"
              className="material-auth-btn"
              onClick={onRetry}
            >
              <span>Try again</span>
            </button>
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
        try {
          const current = await authStatus();
          if (current.phase === "unlocked") {
            onAuthenticated(current);
            return;
          }
        } catch {
          // Preserve the original error.
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
      <div className="onboarding-shell">
        <div className="onboarding-card">
          <HStack justify="between" align="center">
            <div className="onboarding-brand-icon">
              <RowsterIcon size={24} aria-hidden="true" />
            </div>
            <div className="onboarding-step-pills" aria-label="Setup progress">
              <div
                className={`onboarding-step-pill ${
                  step === "name" || step === "password" || step === "passkey"
                    ? "active"
                    : ""
                }`}
              />
              <div
                className={`onboarding-step-pill ${
                  step === "password" || step === "passkey" ? "active" : ""
                }`}
              />
              <div
                className={`onboarding-step-pill ${
                  step === "passkey" ? "active" : ""
                }`}
              />
            </div>
          </HStack>

          <VStack gap={2} align="start">
            <Text type="supporting" color="secondary">
              {step === "name"
                ? "Step 1 of 3: Profile"
                : step === "password"
                ? "Step 2 of 3: Security"
                : "Step 3 of 3: Device Passkey"}
            </Text>
            <Heading level={2}>
              {step === "name"
                ? "Welcome to Rowster"
                : step === "password"
                ? "Protect your browser"
                : "Fast device unlock"}
            </Heading>
            <Text type="body" color="secondary">
              {step === "name"
                ? "Tell us what to call you on the New Tab and welcome screens."
                : step === "password"
                ? "A master password secures your tabs, history, and browser data."
                : "Windows Hello unlocks Rowster quickly using your device PIN, face, or fingerprint."}
            </Text>
          </VStack>

          {error ? (
            <Banner
              status="error"
              title="Could not continue"
              description={error}
              isDismissable
              onDismiss={() => setError(null)}
            />
          ) : null}

          {step === "name" ? (
            <form
              className="material-auth-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (name.trim()) setStep("password");
              }}
            >
              <div className="material-auth-capsule">
                <input
                  type="text"
                  className="material-auth-input"
                  placeholder="How should Rowster greet you?"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  required
                  spellCheck={false}
                />
                <button
                  type="submit"
                  className="material-auth-btn"
                  disabled={!name.trim()}
                >
                  <span>Continue</span>
                </button>
              </div>
            </form>
          ) : step === "password" ? (
            <form
              className="material-auth-form"
              onSubmit={(event) => {
                event.preventDefault();
                continueFromPassword();
              }}
            >
              <VStack gap={3} align="stretch">
                <div className="material-auth-capsule">
                  <input
                    type="password"
                    className="material-auth-input"
                    placeholder="Create password (min 8 characters)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="material-auth-capsule">
                  <input
                    type="password"
                    className="material-auth-input"
                    placeholder="Confirm your password"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                </div>
                <HStack gap={3} align="center">
                  <button
                    type="submit"
                    className="material-auth-btn"
                    style={{ flex: 1, height: 48 }}
                    disabled={!password || !confirmation}
                  >
                    <span>Create password</span>
                  </button>
                  <button
                    type="button"
                    className="material-auth-toggle-btn"
                    style={{ height: 48, padding: "0 var(--spacing-4)" }}
                    onClick={() => complete(false, null)}
                    disabled={busy}
                  >
                    <span>Skip password</span>
                  </button>
                </HStack>
              </VStack>
            </form>
          ) : (
            <VStack gap={4} align="stretch" className="material-auth-form">
              <Section
                variant="muted"
                padding={4}
                style={{ borderRadius: "var(--radius-lg)" }}
              >
                <HStack gap={3} align="center">
                  <ShieldCheck
                    size={20}
                    color="var(--color-text-cyan)"
                    aria-hidden="true"
                  />
                  <VStack gap={1} align="start">
                    <Text type="label">Native Windows Hello</Text>
                    <Text type="supporting" color="secondary">
                      Your credentials and biometric templates stay safely protected in the operating system.
                    </Text>
                  </VStack>
                </HStack>
              </Section>
              <HStack gap={3} align="center">
                <button
                  type="button"
                  className="material-auth-btn"
                  style={{ flex: 1, height: 48 }}
                  disabled={!status.passkey_available || busy}
                  onClick={() => complete(true, password)}
                >
                  <KeyRound size={18} aria-hidden="true" />
                  <span>
                    {status.passkey_available
                      ? busy
                        ? "Setting up..."
                        : "Set up passkey"
                      : "Passkey unavailable"}
                  </span>
                </button>
                <button
                  type="button"
                  className="material-auth-toggle-btn"
                  style={{ height: 48, padding: "0 var(--spacing-4)" }}
                  onClick={() => complete(false, password)}
                  disabled={busy}
                >
                  <span>Skip passkey</span>
                </button>
              </HStack>
            </VStack>
          )}
        </div>
      </div>
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

  const userName = status.name?.trim() || "there";

  return (
    <AuthShell>
      <div className="auth-viewport">
        <div className="auth-hero-container">
          {/* Left Column: Material Clock Widget with contextual Welcome Back greeting */}
          <MaterialClock
            userName={userName}
            greeting={`Welcome back, ${userName}`}
          />

          {/* Right Column: Material You Authentication Area matching New Tab Search Bar */}
          <div className="material-auth-area">
            <div className="material-auth-header">
              <p className="material-auth-subtitle">
                Sign in to restore your tabs and open your browser data.
              </p>
            </div>

            {error ? (
              <Banner
                status="error"
                title="Rowster stayed locked"
                description={error}
                isDismissable
                onDismiss={() => setError(null)}
              />
            ) : null}

            {!usePassword && status.passkey_configured ? (
              <div className="material-auth-form">
                <button
                  type="button"
                  className="material-passkey-card-btn primary"
                  onClick={() => runUnlock(authUnlockPasskey())}
                  disabled={busy}
                >
                  <KeyRound size={20} aria-hidden="true" />
                  <span>
                    {busy ? "Verifying passkey..." : "Unlock with passkey"}
                  </span>
                </button>
                <button
                  type="button"
                  className="material-auth-toggle-btn"
                  onClick={() => {
                    setError(null);
                    setUsePassword(true);
                  }}
                  disabled={busy}
                >
                  <LockKeyhole size={14} aria-hidden="true" />
                  <span>Use master password instead</span>
                </button>
              </div>
            ) : (
              <form className="material-auth-form" onSubmit={submitPassword}>
                <div className="material-auth-capsule">
                  <div className="material-auth-icon">
                    <LockKeyhole size={18} aria-hidden="true" />
                  </div>
                  <input
                    type="password"
                    className="material-auth-input"
                    placeholder="Enter master password..."
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                    disabled={busy}
                  />
                  <button
                    type="submit"
                    className="material-auth-btn"
                    disabled={!password || busy}
                  >
                    <span>{busy ? "Unlocking..." : "Unlock"}</span>
                  </button>
                </div>
                {status.passkey_configured ? (
                  <button
                    type="button"
                    className="material-auth-toggle-btn"
                    onClick={() => {
                      setError(null);
                      setUsePassword(false);
                    }}
                    disabled={busy}
                  >
                    <KeyRound size={14} aria-hidden="true" />
                    <span>Use device passkey instead</span>
                  </button>
                ) : null}
              </form>
            )}
          </div>
        </div>
      </div>
    </AuthShell>
  );
}
