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
import { listOrdersAdmin, ORDER_FILTERS, type OrderFilter } from "@/lib/admin/orders";
import { formatDate, formatPrice } from "@refnused/database/lib/format";

export const metadata: Metadata = { title: "Orders" };

export default function OrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  return (
    <>
      <PageHeader
        title="Orders"
        description="Prepare, dispatch and hand over orders. Oldest first."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Orders searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Orders({ searchParams }: Pick<PageProps<"/admin/orders">, "searchParams">) {
  await requireStaff("orders.manage", "/admin/orders");
  await connection();
  const params = await searchParams;
  const filter = (
    typeof params.filter === "string" && params.filter in ORDER_FILTERS
      ? params.filter
      : "to_fulfil"
  ) as OrderFilter;
  const q = typeof params.q === "string" ? params.q : undefined;
  const rows = await listOrdersAdmin(db, filter, q);
  return (
    <>
      <FilterTabs
        label="Order status"
        current={filter}
        tabs={Object.entries(ORDER_FILTERS).map(([key, f]) => ({
          key,
          label: f.label,
          href: `/admin/orders?filter=${key}`,
        }))}
      />
      <SearchForm
        action={`/admin/orders?filter=${filter}`}
        defaultValue={q}
        placeholder="Order number, email or name"
      />
      {rows.length === 0 ? (
        <Empty>Nothing here.</Empty>
      ) : (
        <DataTable label="Orders">
          <thead>
            <tr>
              <th scope="col">Order</th>
              <th scope="col">Customer</th>
              <th scope="col">How</th>
              <th scope="col" className="text-right">
                Total
              </th>
              <th scope="col">Status</th>
              <th scope="col">Placed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td>
                  <Link
                    href={`/admin/orders/${o.id}`}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {o.orderNumber}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    {o.items} {o.items === 1 ? "phone" : "phones"}
                  </span>
                </td>
                <td>
                  {o.contactName ?? "—"}
                  <span className="block text-xs break-all text-muted-foreground">{o.email}</span>
                </td>
                <td>
                  {o.fulfilmentMethod === "delivery" ? "Delivery" : `Collect: ${o.storeName}`}
                </td>
                <td className="text-right tabular-nums">{formatPrice(o.totalPence)}</td>
                <td>
                  <StatusPill status={o.status} />
                </td>
                <td className="text-xs text-muted-foreground">
                  {o.placedAt ? formatDate(o.placedAt, "short") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </>
  );
}
