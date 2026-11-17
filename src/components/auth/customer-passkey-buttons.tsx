"use client";

import { KeyRoundIcon } from "lucide-react";
import { signIn } from "next-auth/webauthn";
import { useState, useSyncExternalStore } from "react";

import { FormMessage } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";

const subscribe = () => () => {};
function usePasskeysSupported() {
  return useSyncExternalStore(
    subscribe,
    () => typeof window !== "undefined" && "PublicKeyCredential" in window,
    () => false,
  );
}

/** Sign in with an existing passkey (customer). */
export function PasskeySignInButton({ callbackUrl }: { callbackUrl: string }) {
  const supported = usePasskeysSupported();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  if (!supported) return null;

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={pending}
        onClick={async () => {
          setError(undefined);
          setPending(true);
          try {
            await signIn("passkey", { redirectTo: callbackUrl });
          } catch {
            setError("We couldn't sign you in with a passkey. Try again or use your email.");
          } finally {
            setPending(false);
          }
        }}
      >
        <KeyRoundIcon aria-hidden />
        Sign in with a passkey
      </Button>
      {error ? <FormMessage>{error}</FormMessage> : null}
    </div>
  );
}

/** Add a passkey to the signed-in customer's account. */
export function AddPasskeyButton() {
  const supported = usePasskeysSupported();
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string }>();
  const [pending, setPending] = useState(false);

  if (!supported) {
    return <p className="text-sm text-muted-foreground">This browser doesn’t support passkeys.</p>;
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={async () => {
          setMessage(undefined);
          setPending(true);
          try {
            await signIn("passkey", { action: "register", redirectTo: "/account?passkey=added" });
          } catch {
            setMessage({ tone: "error", text: "The passkey wasn’t added. Please try again." });
          } finally {
            setPending(false);
          }
        }}
      >
        <KeyRoundIcon aria-hidden />
        Add a passkey
      </Button>
      {message ? <FormMessage tone={message.tone}>{message.text}</FormMessage> : null}
    </div>
  );
}
