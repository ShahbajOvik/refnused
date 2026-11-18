"use client";

import { useId } from "react";

import { useAdminAction } from "@/app/admin/_components/action-button";
import { Button } from "@/components/ui/button";

import { updateProductAction } from "../intake/actions";

export function ProductEditor({
  productId,
  label,
  pricePence,
  status,
}: {
  productId: string;
  label: string;
  pricePence: number;
  status: string;
}) {
  const id = useId();
  const { pending, run } = useAdminAction();
  if (["sold", "reserved", "returned"].includes(status)) {
    return (
      <span className="text-xs text-muted-foreground">
        {status === "returned" ? "Re-check before relisting" : "—"}
      </span>
    );
  }
  return (
    <form
      aria-label={`Edit ${label}`}
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        run(
          () =>
            updateProductAction({
              productId,
              pricePounds: Number(data.get("price")),
              status: data.get("status") as "listed",
            }),
          { success: (changed) => (changed ? "Saved." : "Nothing changed.") },
        );
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-price`} className="text-xs text-muted-foreground">
          Price (£)
        </label>
        <input
          id={`${id}-price`}
          name="price"
          type="number"
          min={1}
          step="0.01"
          inputMode="decimal"
          defaultValue={(pricePence / 100).toFixed(2)}
          className="h-10 w-24 rounded-lg border border-input bg-background px-2 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-status`} className="text-xs text-muted-foreground">
          Status
        </label>
        <select
          id={`${id}-status`}
          name="status"
          defaultValue={status}
          className="h-10 rounded-lg border border-input bg-background px-2 text-sm"
        >
          <option value="draft">Draft</option>
          <option value="listed">Listed</option>
          <option value="withdrawn">Withdrawn</option>
        </select>
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={pending} className="min-h-10">
        Save<span className="sr-only"> {label}</span>
      </Button>
    </form>
  );
}
