"use client";

import { useId, useState } from "react";

import { useAdminAction } from "@/app/admin/_components/action-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPrice } from "@/lib/format";

import { advanceFulfilmentAction, decideRequestAction, refundAction } from "./actions";

const CARRIERS = ["Royal Mail", "DPD", "Evri", "DHL"];

export function FulfilmentControls({
  orderId,
  status,
  method,
}: {
  orderId: string;
  status: string;
  method: "delivery" | "click_and_collect";
}) {
  const id = useId();
  const { pending, run } = useAdminAction();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const step = (s: "processing" | "ready_for_collection" | "completed", success: string) =>
    run(() => advanceFulfilmentAction({ orderId, step: s }), { success });

  return (
    <div className="flex flex-col gap-4">
      {status === "paid" ? (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          className="min-h-11 self-start"
          onClick={() => step("processing", "Marked as being prepared.")}
        >
          Start preparing
        </Button>
      ) : null}
      {method === "delivery" && (status === "paid" || status === "processing") ? (
        <form
          aria-label="Dispatch"
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            run(
              () =>
                advanceFulfilmentAction({
                  orderId,
                  step: "dispatched",
                  carrier: String(data.get("carrier")),
                  trackingNumber: String(data.get("tracking")),
                }),
              {
                success: "Dispatched. The customer has been emailed the tracking.",
                onError: (r) => setErrors(r.fieldErrors ?? {}),
              },
            );
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-carrier`} className="text-sm font-medium">
              Carrier
            </label>
            <select
              id={`${id}-carrier`}
              name="carrier"
              defaultValue="Royal Mail"
              className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
            >
              {CARRIERS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-tracking`} className="text-sm font-medium">
              Tracking number
            </label>
            <Input
              id={`${id}-tracking`}
              name="tracking"
              autoComplete="off"
              className="uppercase"
              aria-invalid={errors.trackingNumber ? true : undefined}
            />
            {errors.trackingNumber ? (
              <p className="text-sm text-destructive">{errors.trackingNumber[0]}</p>
            ) : null}
          </div>
          <Button type="submit" disabled={pending} className="min-h-11">
            Mark dispatched
          </Button>
        </form>
      ) : null}
      {method === "click_and_collect" && (status === "paid" || status === "processing") ? (
        <Button
          type="button"
          disabled={pending}
          className="min-h-11 self-start"
          onClick={() =>
            step("ready_for_collection", "Ready to collect. The customer has been told.")
          }
        >
          Ready to collect
        </Button>
      ) : null}
      {(method === "delivery" && status === "dispatched") ||
      (method === "click_and_collect" && status === "ready_for_collection") ? (
        <Button
          type="button"
          disabled={pending}
          className="min-h-11 self-start"
          onClick={() =>
            step("completed", method === "delivery" ? "Marked delivered." : "Marked collected.")
          }
        >
          {method === "delivery" ? "Mark delivered" : "Mark collected"}
        </Button>
      ) : null}
    </div>
  );
}

export function RefundForm({
  orderId,
  refundablePence,
}: {
  orderId: string;
  refundablePence: number;
}) {
  const id = useId();
  const { pending, run } = useAdminAction();
  return (
    <form
      aria-label="Refund"
      className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const amount = String(data.get("amount") ?? "");
        const label = amount ? `£${amount}` : formatPrice(refundablePence);
        if (!window.confirm(`Refund ${label} to the customer’s card? This can’t be undone.`))
          return;
        run(
          () =>
            refundAction({
              orderId,
              amountPounds: amount,
              reason: String(data.get("reason") ?? ""),
            }),
          {
            success: (p) =>
              `Refund of ${formatPrice(p)} sent to Stripe. The order updates when Stripe confirms.`,
          },
        );
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-amount`} className="text-sm font-medium">
          Amount (£)
        </label>
        <Input
          id={`${id}-amount`}
          name="amount"
          type="number"
          min={0.01}
          step="0.01"
          max={refundablePence / 100}
          inputMode="decimal"
          placeholder={(refundablePence / 100).toFixed(2)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-reason`} className="text-sm font-medium">
          Reason
        </label>
        <Input id={`${id}-reason`} name="reason" required />
      </div>
      <Button type="submit" variant="destructive" disabled={pending} className="min-h-11">
        Refund
      </Button>
      <p className="text-xs text-muted-foreground sm:col-span-3">
        Leave the amount empty to refund everything that’s left ({formatPrice(refundablePence)}).
      </p>
    </form>
  );
}

export function RequestDecision({
  requestId,
  status,
  reference,
}: {
  requestId: string;
  status: string;
  reference: string;
}) {
  const id = useId();
  const { pending, run } = useAdminAction();
  const options =
    status === "submitted"
      ? ([
          ["approved", "Approve"],
          ["rejected", "Decline"],
        ] as const)
      : ([
          ["completed", "Complete"],
          ["rejected", "Decline"],
        ] as const);
  return (
    <form
      aria-label={`Decide ${reference}`}
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const decision = submitter?.value as "approved" | "rejected" | "completed";
        run(
          () => decideRequestAction({ requestId, decision, note: String(data.get("note") ?? "") }),
          {
            success: `${reference} ${decision}. The customer has been emailed.`,
          },
        );
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-note`} className="text-sm font-medium">
          Note to the customer (optional)
        </label>
        <Input id={`${id}-note`} name="note" />
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map(([value, label]) => (
          <Button
            key={value}
            type="submit"
            name="decision"
            value={value}
            variant={value === "rejected" ? "outline" : "default"}
            disabled={pending}
            className="min-h-11"
          >
            {label}
            <span className="sr-only"> {reference}</span>
          </Button>
        ))}
      </div>
    </form>
  );
}
