import { DownloadIcon } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { DataTable, PageHeader, Section } from "@/app/admin/_components/kit";
import { requireStaff } from "@/auth/guards";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/db";
import { getPriceTable, listModelsForPrices, priceHistory } from "@/lib/admin/prices";
import { formatPrice } from "@/lib/format";

import { CsvImport, MarginCalculator, PriceTable } from "./price-tools";

export const metadata: Metadata = { title: "Prices" };

export default function PricesPage({ searchParams }: PageProps<"/admin/prices">) {
  return (
    <>
      <PageHeader
        title="Trade-in prices"
        description="What we pay, per model, storage, colour and grade. Every change is logged."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Prices searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Prices({ searchParams }: Pick<PageProps<"/admin/prices">, "searchParams">) {
  await requireStaff("prices.update", "/admin/prices");
  await connection();
  const models = await listModelsForPrices(db);
  const params = await searchParams;
  const model =
    typeof params.model === "string" && models.some((m) => m.slug === params.model)
      ? params.model
      : models[0]?.slug;
  const [rows, history] = await Promise.all([
    model ? getPriceTable(db, model) : [],
    priceHistory(db, { limit: 50 }),
  ]);
  const sample = rows[0];
  const brands = [...new Set(models.map((m) => m.brand))];

  return (
    <div className="flex flex-col gap-6">
      <Section>
        <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="price-model" className="text-sm font-medium">
              Model
            </label>
            <select
              id="price-model"
              name="model"
              defaultValue={model}
              className="h-11 min-w-56 rounded-lg border border-input bg-background px-3 text-sm"
            >
              {brands.map((b) => (
                <optgroup key={b} label={b}>
                  {models
                    .filter((m) => m.brand === b)
                    .map((m) => (
                      <option key={m.slug} value={m.slug}>
                        {m.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline" className="min-h-11">
            Show
          </Button>
          <Button asChild variant="ghost" className="min-h-11">
            <a href={`/admin/prices/export?model=${model}`} download>
              <DownloadIcon aria-hidden /> Export this model
            </a>
          </Button>
        </form>
        {/* Remount when the model changes so inputs show the new prices. */}
        <PriceTable key={model} rows={rows} />
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section
          title="Bulk import"
          actions={
            <Button asChild variant="outline" size="sm" className="min-h-10">
              <a href="/admin/prices/export" download>
                <DownloadIcon aria-hidden /> Export all
              </a>
            </Button>
          }
        >
          <CsvImport />
        </Section>
        <Section title="Margin calculator">
          <MarginCalculator
            defaults={
              sample?.prices.A !== undefined && sample.sellingPence.A
                ? { buyPence: sample.prices.A, sellPence: sample.sellingPence.A }
                : undefined
            }
          />
        </Section>
      </div>

      <Section title="Recent price changes">
        {history.length ? (
          <DataTable label="Recent price changes">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Price</th>
                <th scope="col">Change</th>
                <th scope="col">By</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i}>
                  <td className="text-xs whitespace-nowrap text-muted-foreground">
                    {h.at.toLocaleString("en-GB", {
                      timeZone: "Europe/London",
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td>{h.label}</td>
                  <td className="tabular-nums">
                    {h.beforePence === null ? "new" : formatPrice(h.beforePence)} →{" "}
                    {formatPrice(h.afterPence)}
                  </td>
                  <td>
                    {h.staffName ?? "—"}
                    {h.source === "csv" ? (
                      <span className="block text-xs text-muted-foreground">CSV import</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : (
          <p className="text-sm text-muted-foreground">No changes yet.</p>
        )}
      </Section>
    </div>
  );
}
