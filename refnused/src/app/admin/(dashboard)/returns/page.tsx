import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { Empty, FilterTabs, PageHeader, StatusPill } from "@/app/admin/_components/kit";
import { requireStaff } from "@/auth/guards";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/db";
import { listRequests } from "@/lib/admin/orders";
import { formatDate } from "@/lib/format";
import { RETURN_REASONS, WARRANTY_FAULTS } from "@/lib/orders/requests";

import { RequestDecision } from "../orders/order-controls";

export const metadata: Metadata = { title: "Returns and warranty" };

export default function ReturnsPage({ searchParams }: PageProps<"/admin/returns">) {
  return (
    <>
      <PageHeader
        title="Returns and warranty"
        description="Approve, decline and complete requests. Refunds are issued from the order (needs refund permission)."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Requests searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Requests({ searchParams }: Pick<PageProps<"/admin/returns">, "searchParams">) {
  await requireStaff("orders.manage", "/admin/returns");
  await connection();
  const params = await searchParams;
  const status = params.status === "closed" ? "closed" : "open";
  const rows = await listRequests(db, { status });
  return (
    <>
      <FilterTabs
        label="Request status"
        current={status}
        tabs={[
          { key: "open", label: "Open", href: "/admin/returns" },
          { key: "closed", label: "Closed", href: "/admin/returns?status=closed" },
        ]}
      />
      {rows.length === 0 ? (
        <Empty>No {status} requests.</Empty>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">
                  {r.type === "return" ? "Return" : "Warranty"} {r.reference}
                </h2>
                <StatusPill status={r.status} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                <Link href={`/admin/orders/${r.orderId}`} className="text-primary underline">
                  {r.orderNumber}
                </Link>{" "}
                · {r.customerName ?? "Customer"} · {formatDate(r.createdAt, "short")}
              </p>
              <p className="mt-2 text-sm font-medium">{r.item}</p>
              <p className="text-sm">
                {r.type === "return"
                  ? RETURN_REASONS[r.reason as keyof typeof RETURN_REASONS]
                  : WARRANTY_FAULTS[r.reason as keyof typeof WARRANTY_FAULTS]}
                : {r.description}
              </p>
              {r.staffNotes ? (
                <p className="mt-2 text-xs whitespace-pre-line text-muted-foreground">
                  Notes: {r.staffNotes}
                </p>
              ) : null}
              {status === "open" ? (
                <div className="mt-4 border-t pt-4">
                  <RequestDecision requestId={r.id} status={r.status} reference={r.reference} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
