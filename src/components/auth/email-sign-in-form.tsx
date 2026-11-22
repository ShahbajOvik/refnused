"use client";

import { MailIcon } from "lucide-react";
import { useActionState } from "react";

import { FormMessage } from "@/components/auth/auth-card";
import { TurnstileWidget } from "@/components/sell/turnstile-widget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type EmailFormState = { error?: string } | undefined;

const noop = () => {};

export function EmailSignInForm({
  action,
  callbackUrl,
  turnstileSiteKey,
  turnstileAction,
}: {
  action: (state: EmailFormState, formData: FormData) => Promise<EmailFormState>;
  callbackUrl: string;
  /** NEXT_PUBLIC_TURNSTILE_SITE_KEY; unset in development and tests. */
  turnstileSiteKey?: string;
  turnstileAction: "customer_sign_in" | "staff_sign_in";
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <div className="grid gap-2">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email webauthn"
          inputMode="email"
          required
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? "email-error" : undefined}
        />
      </div>
      {turnstileSiteKey ? (
        <TurnstileWidget siteKey={turnstileSiteKey} action={turnstileAction} onToken={noop} />
      ) : null}
      {state?.error ? (
        <div id="email-error">
          <FormMessage>{state.error}</FormMessage>
        </div>
      ) : null}
      <Button type="submit" size="lg" disabled={pending}>
        <MailIcon aria-hidden />
        {pending ? "Sending link…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}
