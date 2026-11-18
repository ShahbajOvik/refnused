import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import {
  DataTable,
  Empty,
  FilterTabs,
  PageHeader,
  Section,
  StatusPill,
} from "@/app/admin/_components/kit";
import { requireStaff } from "@/auth/guards";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/db";
import { listPayouts, type PayoutFilter } from "@/lib/admin/payouts";
import { formatDate, formatPrice } from "@/lib/format";

import { ExportButton, MarkFailedButton, MarkPaidForm } from "./payout-controls";

export const metadata: Metadata = { title: "Payouts" };

const FILTERS: Record<PayoutFilter, string> = {
  ready: "Ready to pay",
  processing: "Sent to bank",
  paid: "Paid",
  other: "Failed / cancelled",
};

export default function PayoutsPage({ searchParams }: PageProps<"/admin/payouts">) {
  return (
    <>
      <PageHeader
        title="Payouts"
        description="Pay approved trade-ins: export a bank file, make the payments in online banking, then mark them paid."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Payouts searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Payouts({ searchParams }: Pick<PageProps<"/admin/payouts">, "searchParams">) {
  await requireStaff("payouts.approve", "/admin/payouts");
  await connection();
  const params = await searchParams;
  const filter = (
    typeof params.filter === "string" && params.filter in FILTERS ? params.filter : "ready"
  ) as PayoutFilter;
  const rows = await listPayouts(db, filter);
  const bankRows = rows.filter((r) => r.method === "bank_transfer");
  const total = bankRows.reduce((s, r) => s + r.amountPence, 0);

  return (
    <>
      <FilterTabs
        label="Payout status"
        current={filter}
        tabs={Object.entries(FILTERS).map(([key, label]) => ({
          key,
          label,
          href: `/admin/payouts?filter=${key}`,
        }))}
      />
      {rows.length === 0 ? (
        <Empty>Nothing here.</Empty>
      ) : filter === "processing" ? (
        <Section title="Sent to bank">
          <MarkPaidForm
            payouts={rows.map((r) => ({
              id: r.id,
              label: `${r.quoteReference} · ${r.customerName ?? "Customer"} · ending ${r.accountNumberLast4 ?? "—"} · ${r.exportBatchId ?? ""}`,
              amountPence: r.amountPence,
            }))}
          />
          <ul className="mt-6 flex flex-wrap gap-2">
            {rows.map((r) => (
              <li key={r.id}>
                <MarkFailedButton payoutId={r.id} label={r.quoteReference} />
              </li>
            ))}
          </ul>
        </Section>
      ) : (
        <>
          {filter === "ready" ? (
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <ExportButton count={bankRows.length} totalPence={total} />
              <p className="text-sm text-muted-foreground">
                {bankRows.length} bank transfers, {formatPrice(total)}. The file has full bank
                details: delete it once uploaded to the bank.
              </p>
            </div>
          ) : null}
          <DataTable label="Payouts">
            <thead>
              <tr>
                <th scope="col">Trade-in</th>
                <th scope="col">Customer</th>
                <th scope="col" className="text-right">
                  Amount
                </th>
                <th scope="col">Account</th>
                <th scope="col">Status</th>
                <th scope="col">Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link
                      href={`/admin/quotes/${r.quoteId}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {r.quoteReference}
                    </Link>
                  </td>
                  <td>{r.customerName ?? "—"}</td>
                  <td className="text-right tabular-nums">{formatPrice(r.amountPence)}</td>
                  <td>
                    {r.method === "bank_transfer"
                      ? `Ending ${r.accountNumberLast4 ?? "—"}`
                      : "In store"}
                  </td>
                  <td>
                    <StatusPill status={r.status} />
                    {r.failureReason ? (
                      <span className="block text-xs text-muted-foreground">{r.failureReason}</span>
                    ) : null}
                  </td>
                  <td className="text-xs text-muted-foreground">
                    {r.paidAt
                      ? formatDate(r.paidAt, "short")
                      : r.exportedAt
                        ? formatDate(r.exportedAt, "short")
                        : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </>
      )}
    </>
  );
}
