"use client";

import { useId, useMemo, useState } from "react";

import { useAdminAction } from "@/app/admin/_components/action-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { calculateMargin } from "@/lib/admin/margin";
import type { ImportPreview, PriceGrade, PriceRow } from "@/lib/admin/prices";
import { formatPrice } from "@refnused/database/lib/format";

import { applyImportAction, previewImportAction, savePricesAction } from "./actions";

const GRADES: { key: PriceGrade; label: string }[] = [
  { key: "A", label: "Grade A" },
  { key: "B", label: "Grade B" },
  { key: "C", label: "Grade C" },
  { key: "faulty", label: "Faulty" },
];

/** Editable price grid. Only changed cells are sent. */
export function PriceTable({ rows }: { rows: PriceRow[] }) {
  const { pending, run } = useAdminAction();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const changes = Object.entries(edits).flatMap(([key, value]) => {
    const [variantId, grade] = key.split("|") as [string, PriceGrade];
    const row = rows.find((r) => r.variantId === variantId);
    const pence = Math.round(Number(value) * 100);
    if (value === "" || !Number.isFinite(pence) || pence < 0 || pence === row?.prices[grade])
      return [];
    return [{ variantId, grade, pricePence: pence }];
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => savePricesAction({ changes }), {
          success: (n) => `${n} ${n === 1 ? "price" : "prices"} saved.`,
          onSuccess: () => setEdits({}),
        });
      }}
    >
      <div
        role="region"
        aria-label="Trade-in prices"
        tabIndex={0}
        className="overflow-x-auto rounded-xl border bg-card"
      >
        <table className="w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th scope="col" className="px-3 py-2 font-medium">
                Variant
              </th>
              {GRADES.map((g) => (
                <th key={g.key} scope="col" className="px-3 py-2 font-medium">
                  {g.label} (£)
                </th>
              ))}
              <th scope="col" className="px-3 py-2 font-medium">
                Shop price (A / B / C)
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const label = `${r.storageGb}GB ${r.colour}`;
              return (
                <tr key={r.variantId} className="border-t">
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {label}
                  </th>
                  {GRADES.map((g) => {
                    const key = `${r.variantId}|${g.key}`;
                    const current = r.prices[g.key];
                    const edited =
                      edits[key] !== undefined &&
                      changes.some((c) => c.variantId === r.variantId && c.grade === g.key);
                    return (
                      <td key={g.key} className="px-2 py-1.5">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          inputMode="decimal"
                          aria-label={`${label}, ${g.label}`}
                          defaultValue={current !== undefined ? (current / 100).toFixed(2) : ""}
                          onChange={(e) => setEdits((s) => ({ ...s, [key]: e.target.value }))}
                          className={`h-10 w-24 rounded-md border bg-background px-2 tabular-nums ${edited ? "border-primary ring-2 ring-primary/30" : "border-input"}`}
                        />
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                    {(["A", "B", "C"] as const)
                      .map((g) =>
                        r.sellingPence[g] ? formatPrice(r.sellingPence[g]!, { whole: true }) : "—",
                      )
                      .join(" / ")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || changes.length === 0} className="min-h-11">
          {pending
            ? "Saving…"
            : `Save ${changes.length || ""} ${changes.length === 1 ? "change" : "changes"}`}
        </Button>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {changes.length ? `${changes.length} unsaved` : "Edit a price to change it."}
        </p>
      </div>
    </form>
  );
}

export function CsvImport() {
  const id = useId();
  const { pending, run } = useAdminAction();
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-file`} className="text-sm font-medium">
          Price CSV
        </label>
        <input
          id={`${id}-file`}
          type="file"
          accept=".csv,text/csv"
          className="text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border file:bg-background file:px-4"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            setPreview(null);
            if (!file) return setCsv(null);
            const text = await file.text();
            setCsv(text);
            run(() => previewImportAction({ csv: text }), {
              success: (p) =>
                p.errors.length
                  ? `${p.errors.length} problems found.`
                  : `${p.changes.length} prices will change.`,
              onSuccess: setPreview,
            });
          }}
        />
        <p className="text-xs text-muted-foreground">
          Start from an export. Only the price columns are read; empty cells are left alone.
        </p>
      </div>
      {preview ? (
        <div aria-live="polite" className="flex flex-col gap-3">
          {preview.errors.length ? (
            <div role="alert" className="rounded-lg border border-destructive p-3 text-sm">
              <p className="font-medium text-destructive">Fix these before importing:</p>
              <ul className="mt-1 list-disc pl-5">
                {preview.errors.slice(0, 20).map((e, i) => (
                  <li key={i}>
                    {e.line ? `Line ${e.line}: ` : ""}
                    {e.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-sm">
            {preview.changes.length} changes, {preview.unchanged} unchanged.
          </p>
          {preview.changes.length ? (
            <ul className="max-h-64 overflow-y-auto rounded-lg border text-sm">
              {preview.changes.map((c) => (
                <li
                  key={`${c.variantId}${c.grade}`}
                  className="flex justify-between gap-4 border-b px-3 py-1.5 last:border-b-0"
                >
                  <span>{c.label}</span>
                  <span className="tabular-nums">
                    {c.beforePence === null ? "—" : formatPrice(c.beforePence)} →{" "}
                    <strong>{formatPrice(c.pricePence)}</strong>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <Button
            type="button"
            disabled={pending || !csv || preview.errors.length > 0 || preview.changes.length === 0}
            className="min-h-11 self-start"
            onClick={() =>
              run(() => applyImportAction({ csv: csv! }), {
                success: (n) => `${n} prices imported.`,
                onSuccess: () => setPreview(null),
              })
            }
          >
            Import {preview.changes.length} changes
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function MarginCalculator({
  defaults,
}: {
  defaults?: { buyPence: number; sellPence: number };
}) {
  const id = useId();
  const [buy, setBuy] = useState(defaults ? (defaults.buyPence / 100).toFixed(2) : "");
  const [refurb, setRefurb] = useState("15.00");
  const [sell, setSell] = useState(defaults ? (defaults.sellPence / 100).toFixed(2) : "");
  const [scheme, setScheme] = useState(true);
  const toPence = (v: string) => Math.max(0, Math.round((Number(v) || 0) * 100));
  const result = useMemo(
    () =>
      calculateMargin({
        buyPence: toPence(buy),
        refurbPence: toPence(refurb),
        sellPence: toPence(sell),
        marginScheme: scheme,
      }),
    [buy, refurb, sell, scheme],
  );
  const field = (key: string, label: string, value: string, set: (v: string) => void) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${id}-${key}`} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={`${id}-${key}`}
        type="number"
        min={0}
        step="0.01"
        inputMode="decimal"
        value={value}
        onChange={(e) => set(e.target.value)}
      />
    </div>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {field("buy", "We pay (£)", buy, setBuy)}
        {field("refurb", "Refurbishment (£)", refurb, setRefurb)}
        {field("sell", "We sell for (£)", sell, setSell)}
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={scheme}
          onChange={(e) => setScheme(e.target.checked)}
          className="size-5 accent-(--primary)"
        />
        VAT margin scheme (VAT is 1/6 of the margin)
      </label>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4" aria-live="polite">
        <div>
          <dt className="text-muted-foreground">Card fees</dt>
          <dd className="tabular-nums">{formatPrice(result.feesPence)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">VAT</dt>
          <dd className="tabular-nums">{formatPrice(result.vatPence)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Profit</dt>
          <dd
            className={`font-semibold tabular-nums ${result.profitPence < 0 ? "text-destructive" : ""}`}
          >
            {formatPrice(result.profitPence)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Margin</dt>
          <dd className="font-semibold tabular-nums">{result.marginPercent}%</dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        Card fees assumed at 1.5% + 20p. Check rates and VAT treatment with your accountant.
      </p>
    </div>
  );
}
