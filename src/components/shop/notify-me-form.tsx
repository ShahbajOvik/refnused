"use client";

import { useId, useRef, useState, useTransition } from "react";

import { createStockAlertAction, type StockAlertActionResult } from "@/app/(site)/shop/actions";
import { TurnstileWidget } from "@/components/sell/turnstile-widget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** "Tell me when one's in stock" for a sold or reserved phone. */
export function NotifyMeForm({
  productId,
  modelName,
  storageGb,
  turnstileSiteKey,
}: {
  productId: string;
  modelName: string;
  storageGb: number;
  turnstileSiteKey?: string;
}) {
  const id = useId();
  const [result, setResult] = useState<StockAlertActionResult | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const status = useRef<HTMLDivElement>(null);

  const fieldError = (name: string) =>
    result && !result.ok ? result.fieldErrors?.[name]?.[0] : undefined;
  const emailError = fieldError("email");
  const consentError = fieldError("consent");

  if (result?.ok) {
    return (
      <p role="status" className="rounded-xl border bg-muted/40 p-4 font-medium">
        {result.message}
      </p>
    );
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(async () => {
          const next = await createStockAlertAction(
            {
              productId,
              email: data.get("email"),
              scope: data.get("scope"),
              consent: data.get("consent") === "yes",
            },
            token,
          );
          setResult(next);
          if (!next.ok) status.current?.focus();
        });
      }}
    >
      <div ref={status} tabIndex={-1} className="focus:outline-none">
        {result && !result.ok ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {result.error}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-email`} className="text-sm font-medium">
          Email
        </label>
        <Input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? `${id}-email-error` : undefined}
        />
        {emailError ? (
          <p id={`${id}-email-error`} className="text-sm text-destructive">
            {emailError}
          </p>
        ) : null}
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Which phones?</legend>
        <div className="flex flex-col gap-1">
          {(
            [
              ["storage", `${modelName} ${storageGb}GB only`],
              ["model", `Any ${modelName}`],
            ] as const
          ).map(([value, label], index) => (
            <label key={value} className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="radio"
                name="scope"
                value={value}
                defaultChecked={index === 0}
                className="size-5 shrink-0 accent-(--primary)"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="consent"
            value="yes"
            aria-invalid={consentError ? true : undefined}
            aria-describedby={consentError ? `${id}-consent-error` : undefined}
            className="mt-0.5 size-5 shrink-0 accent-(--primary)"
          />
          <span>
            Email me when one is in stock. We’ll only use your email for this alert, and every email
            has a link to stop it.
          </span>
        </label>
        {consentError ? (
          <p id={`${id}-consent-error`} className="text-sm text-destructive">
            {consentError}
          </p>
        ) : null}
      </div>
      {turnstileSiteKey ? (
        <TurnstileWidget siteKey={turnstileSiteKey} action="stock_alert" onToken={setToken} />
      ) : null}
      <Button type="submit" disabled={pending} className="min-h-11 self-start">
        {pending ? "Saving…" : "Notify me"}
      </Button>
    </form>
  );
}
