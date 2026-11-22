"use client";

import { DownloadIcon } from "lucide-react";
import { useState } from "react";

import { useAdminAction } from "@/app/admin/_components/action-button";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@refnused/database/lib/format";

import { exportPayoutsAction, markFailedAction, markPaidAction } from "./actions";

export function ExportButton({ count, totalPence }: { count: number; totalPence: number }) {
  const { pending, run } = useAdminAction();
  return (
    <Button
      type="button"
      disabled={pending || count === 0}
      className="min-h-11"
      onClick={() => {
        if (
          !window.confirm(
            `Create a bank file for ${count} payouts (${formatPrice(totalPence)})? They’ll move to “Sent to bank”.`,
          )
        )
          return;
        run(() => exportPayoutsAction({}), {
          success: (batch) =>
            batch
              ? `Bank file ${batch.batchId} downloaded (${batch.count} payouts).`
              : "Nothing to export.",
          onSuccess: (batch) => {
            if (!batch) return;
            const url = URL.createObjectURL(new Blob([batch.csv], { type: "text/csv" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = `${batch.batchId}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          },
        });
      }}
    >
      <DownloadIcon aria-hidden />
      {pending ? "Creating file…" : "Export bank file"}
    </Button>
  );
}

export function MarkPaidForm({
  payouts,
}: {
  payouts: { id: string; label: string; amountPence: number }[];
}) {
  const { pending, run } = useAdminAction();
  const [selected, setSelected] = useState<string[]>([]);
  const total = payouts
    .filter((p) => selected.includes(p.id))
    .reduce((s, p) => s + p.amountPence, 0);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => markPaidAction({ payoutIds: selected }), {
          success: (n) => `${n} payouts marked paid. Customers have been emailed.`,
          onSuccess: () => setSelected([]),
        });
      }}
    >
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Tick the ones that left the bank</legend>
        <div className="mb-2">
          <label className="inline-flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-5 accent-(--primary)"
              checked={selected.length === payouts.length && payouts.length > 0}
              onChange={(e) => setSelected(e.target.checked ? payouts.map((p) => p.id) : [])}
            />
            Select all
          </label>
        </div>
        <ul className="divide-y rounded-lg border">
          {payouts.map((p) => (
            <li key={p.id}>
              <label className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="size-5 accent-(--primary)"
                  checked={selected.includes(p.id)}
                  onChange={(e) =>
                    setSelected((s) =>
                      e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id),
                    )
                  }
                />
                <span className="flex-1">{p.label}</span>
                <span className="tabular-nums">{formatPrice(p.amountPence)}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <Button type="submit" disabled={pending || selected.length === 0} className="mt-4 min-h-11">
        {pending
          ? "Saving…"
          : `Mark ${selected.length || ""} paid${selected.length ? ` (${formatPrice(total)})` : ""}`}
      </Button>
    </form>
  );
}

export function MarkFailedButton({ payoutId, label }: { payoutId: string; label: string }) {
  const { pending, run } = useAdminAction();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      className="min-h-10"
      onClick={() => {
        const reason = window.prompt(`Why did the payment for ${label} fail?`);
        if (!reason) return;
        run(() => markFailedAction({ payoutId, reason }), {
          success: "Moved back to ready to pay.",
        });
      }}
    >
      Failed<span className="sr-only">: {label}</span>
    </Button>
  );
}
