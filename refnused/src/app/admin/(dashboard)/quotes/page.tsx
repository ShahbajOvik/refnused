import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import {
  DataTable,
  Empty,
  FilterTabs,
  PageHeader,
  SearchForm,
  StatusPill,
} from "@/app/admin/_components/kit";
import { requireStaff } from "@/auth/guards";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@refnused/database/db";
import { listQuoteQueue, QUEUE_FILTERS, type QueueFilter } from "@refnused/database/lib/admin/quotes";
import { formatDate, formatPrice } from "@refnused/database/lib/format";

export const metadata: Metadata = { title: "Trade-ins" };

export default function QuotesPage({ searchParams }: PageProps<"/admin/quotes">) {
  return (
    <>
      <PageHeader
        title="Trade-ins"
        description="Phones customers are selling us, from accepted quote to payment."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Queue searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const DELIVERY: Record<string, string> = {
  postage_pack: "Postage pack",
  print_label: "Own label",
  store_drop_off: "Drop-off",
  courier_collection: "Courier",
  freepost: "Freepost",
};

async function Queue({ searchParams }: Pick<PageProps<"/admin/quotes">, "searchParams">) {
  await requireStaff("quotes.manage", "/admin/quotes");
  await connection();
  const params = await searchParams;
  const filter = (
    typeof params.filter === "string" && params.filter in QUEUE_FILTERS
      ? params.filter
      : "to_inspect"
  ) as QueueFilter;
  const q = typeof params.q === "string" ? params.q : undefined;
  const rows = await listQuoteQueue(db, filter, q);

  return (
    <>
      <FilterTabs
        label="Trade-in status"
        current={filter}
        tabs={Object.entries(QUEUE_FILTERS).map(([key, f]) => ({
          key,
          label: f.label,
          href: `/admin/quotes?filter=${key}`,
        }))}
      />
      <SearchForm
        action={`/admin/quotes?filter=${filter}`}
        defaultValue={q}
        placeholder="Reference, email, name or IMEI"
      />
      {rows.length === 0 ? (
        <Empty>Nothing here.</Empty>
      ) : (
        <DataTable label="Trade-ins">
          <thead>
            <tr>
              <th scope="col">Reference</th>
              <th scope="col">Phone</th>
              <th scope="col">Customer</th>
              <th scope="col">Offer</th>
              <th scope="col">How</th>
              <th scope="col">Status</th>
              <th scope="col">Dates</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link
                    href={`/admin/quotes/${r.id}`}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {r.reference}
                  </Link>
                </td>
                <td>
                  {r.device}
                  {r.imei ? (
                    <span className="block font-mono text-xs text-muted-foreground">{r.imei}</span>
                  ) : null}
                </td>
                <td>{r.customerName ?? r.customerEmail ?? "—"}</td>
                <td className="tabular-nums">{formatPrice(r.offeredPricePence)}</td>
                <td>
                  {r.deliveryMethod === "store_drop_off"
                    ? (r.dropOffStore ?? "Drop-off")
                    : (DELIVERY[r.deliveryMethod ?? ""] ?? "—")}
                </td>
                <td>
                  <StatusPill
                    status={r.declinedRevision && r.status === "revised" ? "send back" : r.status}
                  />
                </td>
                <td className="text-xs text-muted-foreground">
                  {r.receivedAt
                    ? `Received ${formatDate(r.receivedAt, "short")}`
                    : r.acceptedAt
                      ? `Accepted ${formatDate(r.acceptedAt, "short")}`
                      : ""}
                  {r.status === "accepted" ? (
                    <span className="block">
                      Lock ends {formatDate(r.priceLockedUntil, "short")}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </>
  );
}
