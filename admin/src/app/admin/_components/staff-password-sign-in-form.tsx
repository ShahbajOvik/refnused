"use client";

import { LogInIcon } from "lucide-react";
import { useActionState } from "react";

import { FormMessage } from "@/components/auth/auth-card";
import { TurnstileWidget } from "@/components/sell/turnstile-widget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type PasswordFormState = { error: string; email: string; attempt: number } | undefined;

const ignoreToken = () => {};

export function StaffPasswordSignInForm({
  action,
  callbackUrl,
  turnstileSiteKey,
}: {
  action: (state: PasswordFormState, formData: FormData) => Promise<PasswordFormState>;
  callbackUrl: string;
  turnstileSiteKey?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <div className="grid gap-2">
        <Label htmlFor="staff-id">Staff ID (work email)</Label>
        <Input
          id="staff-id"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          defaultValue={state?.email}
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? "staff-password-error" : undefined}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="staff-password">Password</Label>
        <Input
          id="staff-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? "staff-password-error" : undefined}
        />
      </div>
      {turnstileSiteKey ? (
        // Tokens are single use, so a failed attempt gets a fresh widget.
        // Turnstile adds its token to this form as cf-turnstile-response.
        <TurnstileWidget
          key={state?.attempt ?? 0}
          siteKey={turnstileSiteKey}
          action="staff_sign_in"
          onToken={ignoreToken}
        />
      ) : null}
      {state?.error ? (
        <div id="staff-password-error">
          <FormMessage>{state.error}</FormMessage>
        </div>
      ) : null}
      <Button type="submit" size="lg" disabled={pending}>
        <LogInIcon aria-hidden />
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
