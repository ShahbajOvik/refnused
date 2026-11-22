"use client";

import { useId, useRef, useState, useTransition } from "react";

import type { OrderRequestActionResult } from "@/app/(site)/orders/actions";
import { TurnstileWidget } from "@/components/sell/turnstile-widget";
import { Button } from "@/components/ui/button";
import { RETURN_REASONS, WARRANTY_FAULTS } from "@refnused/database/lib/orders/requests";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/** Return (within 14 days) or warranty claim for one phone in an order. */
export function OrderRequestForm({
  submitAction,
  orderItemId,
  itemName,
  canReturn,
  canClaimWarranty,
  turnstileSiteKey,
}: {
  /** Server action (bound to the order link's token, or the account's session). */
  submitAction: (raw: unknown, turnstileToken: string | null) => Promise<OrderRequestActionResult>;
  orderItemId: string;
  itemName: string;
  canReturn: boolean;
  canClaimWarranty: boolean;
  turnstileSiteKey?: string;
}) {
  const id = useId();
  const [type, setType] = useState<"return" | "warranty">(canReturn ? "return" : "warranty");
  const [result, setResult] = useState<OrderRequestActionResult | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const statusRef = useRef<HTMLDivElement>(null);
  const options = type === "return" ? RETURN_REASONS : WARRANTY_FAULTS;
  const fieldError = (name: string) =>
    result && !result.ok ? result.fieldErrors?.[name]?.[0] : undefined;

  // The page stays mounted after a refresh, so this message survives even
  // when there's nothing left to request for this phone.
  if (result?.ok) {
    return (
      <p role="status" className="rounded-xl border bg-muted/40 p-4 font-medium">
        {result.message}
      </p>
    );
  }
  if (!canReturn && !canClaimWarranty) return null;

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      aria-label={`Return or warranty claim for ${itemName}`}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(async () => {
          const next = await submitAction(
            {
              type,
              orderItemId,
              reason: data.get("reason"),
              description: data.get("description"),
            },
            turnstileToken,
          );
          setResult(next);
          if (!next.ok) requestAnimationFrame(() => statusRef.current?.focus());
        });
      }}
    >
      <div ref={statusRef} tabIndex={-1} className="focus:outline-none">
        {result && !result.ok ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {result.error}
          </p>
        ) : null}
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">What do you need?</legend>
        <div className="flex flex-wrap gap-4">
          {canReturn ? (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name="type"
                checked={type === "return"}
                onChange={() => setType("return")}
                className="size-5 accent-(--primary)"
              />
              Return it for a refund
            </label>
          ) : null}
          {canClaimWarranty ? (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name="type"
                checked={type === "warranty"}
                onChange={() => setType("warranty")}
                className="size-5 accent-(--primary)"
              />
              Report a fault (warranty)
            </label>
          ) : null}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-reason`} className="text-sm font-medium">
          {type === "return" ? "Reason" : "What’s wrong?"}
        </label>
        <select
          id={`${id}-reason`}
          name="reason"
          key={type}
          defaultValue=""
          className={selectClass}
          aria-invalid={fieldError("reason") ? true : undefined}
          aria-describedby={fieldError("reason") ? `${id}-reason-error` : undefined}
        >
          <option value="" disabled>
            Choose one
          </option>
          {Object.entries(options).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {fieldError("reason") ? (
          <p id={`${id}-reason-error`} className="text-sm text-destructive">
            {fieldError("reason")}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-description`} className="text-sm font-medium">
          {type === "return" ? "Anything else we should know?" : "Describe the fault"}
        </label>
        <textarea
          id={`${id}-description`}
          name="description"
          rows={4}
          maxLength={2000}
          aria-invalid={fieldError("description") ? true : undefined}
          aria-describedby={fieldError("description") ? `${id}-description-error` : undefined}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />
        {fieldError("description") ? (
          <p id={`${id}-description-error`} className="text-sm text-destructive">
            {fieldError("description")}
          </p>
        ) : null}
      </div>
      {turnstileSiteKey ? (
        <TurnstileWidget
          siteKey={turnstileSiteKey}
          action="order_request"
          onToken={setTurnstileToken}
        />
      ) : null}
      <Button type="submit" disabled={pending} className="min-h-11 self-start">
        {pending ? "Sending…" : type === "return" ? "Request a return" : "Send warranty claim"}
      </Button>
    </form>
  );
}
