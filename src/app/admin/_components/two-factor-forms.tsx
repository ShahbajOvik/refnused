"use client";

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { KeyRoundIcon, SmartphoneIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";

import {
  confirmTotpSetupAction,
  passkeyAuthOptionsAction,
  passkeyAuthVerifyAction,
  passkeyRegOptionsAction,
  passkeyRegVerifyAction,
  startTotpSetupAction,
  verifyTotpAction,
} from "@/app/admin/two-factor-actions";
import { FormMessage } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function CodeField({ error }: { error?: string }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="totp-code">6-digit code</Label>
      <Input
        id="totp-code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        className="max-w-48 text-lg tracking-[0.3em]"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "totp-error" : undefined}
      />
      {error ? (
        <div id="totp-error">
          <FormMessage>{error}</FormMessage>
        </div>
      ) : null}
    </div>
  );
}

export function TotpVerifyForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, action, pending] = useActionState(verifyTotpAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <CodeField error={state?.error} />
      <Button type="submit" disabled={pending} className="self-start">
        <SmartphoneIcon aria-hidden />
        {pending ? "Checking…" : "Verify code"}
      </Button>
    </form>
  );
}

export function StartTotpSetupButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() => startTransition(() => startTotpSetupAction())}
    >
      <SmartphoneIcon aria-hidden />
      Use an authenticator app
    </Button>
  );
}

export function TotpConfirmForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, action, pending] = useActionState(confirmTotpSetupAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}
      <CodeField error={state?.error} />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Checking…" : "Confirm and turn on"}
      </Button>
    </form>
  );
}

function passkeyErrorMessage(error: unknown) {
  if (error instanceof Error && error.name === "NotAllowedError") {
    return "The passkey request was cancelled or timed out.";
  }
  if (error instanceof Error && error.name === "InvalidStateError") {
    return "This passkey is already registered.";
  }
  return "Something went wrong with the passkey. Please try again.";
}

export function PasskeyVerifyButton({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        size="lg"
        disabled={pending}
        onClick={async () => {
          setError(undefined);
          setPending(true);
          try {
            const options = await passkeyAuthOptionsAction();
            if (!options) throw new Error("No passkey available");
            const response = await startAuthentication(options);
            const result = await passkeyAuthVerifyAction(response, callbackUrl);
            if (result.redirectTo) router.replace(result.redirectTo);
            else setError(result.ok ? undefined : result.error);
          } catch (e) {
            setError(passkeyErrorMessage(e));
          } finally {
            setPending(false);
          }
        }}
      >
        <KeyRoundIcon aria-hidden />
        {pending ? "Waiting for passkey…" : "Use my passkey"}
      </Button>
      {error ? <FormMessage>{error}</FormMessage> : null}
    </div>
  );
}

export function PasskeyRegisterForm({ callbackUrl = "" }: { callbackUrl?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const name = String(new FormData(event.currentTarget).get("name") ?? "");
        setError(undefined);
        setPending(true);
        try {
          const options = await passkeyRegOptionsAction();
          if (!options) throw new Error("Not allowed");
          const response = await startRegistration(options);
          const result = await passkeyRegVerifyAction(response, name, callbackUrl);
          if (result.redirectTo) router.replace(result.redirectTo);
          else setError(result.ok ? undefined : result.error);
        } catch (e) {
          setError(passkeyErrorMessage(e));
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="passkey-name">Name this passkey</Label>
        <Input
          id="passkey-name"
          name="name"
          placeholder="Work laptop"
          maxLength={60}
          className="max-w-xs"
        />
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        <KeyRoundIcon aria-hidden />
        {pending ? "Waiting for passkey…" : "Create a passkey"}
      </Button>
      {error ? <FormMessage>{error}</FormMessage> : null}
    </form>
  );
}
