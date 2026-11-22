import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { PageHeader, Section, StatusPill } from "@/app/admin/_components/kit";
import { requireStaff } from "@/auth/guards";
import { can } from "@/auth/roles";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@refnused/database/db";
import { orders, payments } from "@refnused/database/db/schema";
import { formatDate, formatPrice } from "@refnused/database/lib/format";
import { getOrderById } from "@refnused/database/lib/orders/order-service";

import { FulfilmentControls, RefundForm } from "../order-controls";

export const metadata: Metadata = { title: "Order" };

export default function OrderPage({ params }: PageProps<"/admin/orders/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Order params={params} />
    </Suspense>
  );
}

async function Order({ params }: Pick<PageProps<"/admin/orders/[id]">, "params">) {
  const { staff } = await requireStaff("orders.manage", "/admin/orders");
  await connection();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const order = await getOrderById(db, id);
  if (!order) notFound();
  const [[payment], [owner]] = await Promise.all([
    db
      .select({
        amountPence: payments.amountPence,
        refundedPence: payments.amountRefundedPence,
        status: payments.status,
      })
      .from(payments)
      .where(and(eq(payments.orderId, id))),
    db.select({ customerId: orders.customerId }).from(orders).where(eq(orders.id, id)),
  ]);
  const refundable =
    payment && ["succeeded", "partially_refunded"].includes(payment.status)
      ? payment.amountPence - payment.refundedPence
      : 0;

  return (
    <>
      <Link
        href="/admin/orders"
        className="text-sm text-primary underline-offset-4 hover:underline"
      >
        ← Orders
      </Link>
      <PageHeader
        title={`Order ${order.orderNumber}`}
        description={
          <>
            <StatusPill status={order.status} /> ·{" "}
            {order.placedAt ? `Paid ${formatDate(order.placedAt)}` : "Not paid"} ·{" "}
            {formatPrice(order.totalPence)}
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-6">
          <Section title={order.fulfilmentMethod === "delivery" ? "Delivery" : "Click and collect"}>
            {order.fulfilmentMethod === "delivery" && order.shippingAddress ? (
              <address className="mb-4 text-sm not-italic">
                {order.shippingAddress.name}, {order.shippingAddress.line1}
                {order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ""},{" "}
                {order.shippingAddress.town} {order.shippingAddress.postcode}
                <span className="block text-muted-foreground">{order.deliveryLabel}</span>
              </address>
            ) : order.collectionStore ? (
              <p className="mb-4 text-sm">
                {order.collectionStore.name}, {order.collectionStore.town}
              </p>
            ) : null}
            {order.tracking ? (
              <p className="mb-4 text-sm">
                {order.tracking.carrier} {order.tracking.number}
                {order.tracking.url ? (
                  <a
                    href={order.tracking.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 text-primary underline"
                  >
                    Track<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                ) : null}
              </p>
            ) : null}
            <FulfilmentControls
              orderId={order.id}
              status={order.status}
              method={order.fulfilmentMethod}
            />
          </Section>
          <Section title="Phones">
            <ul className="divide-y text-sm">
              {order.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-4 py-2">
                  <Link href={item.productPath} className="underline-offset-4 hover:underline">
                    {item.description}
                  </Link>
                  <span className="tabular-nums">{formatPrice(item.unitPricePence)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 grid grid-cols-[1fr_auto] gap-1 border-t pt-3 text-sm">
              <dt>Delivery</dt>
              <dd className="text-right">
                {order.deliveryPence ? formatPrice(order.deliveryPence) : "Free"}
              </dd>
              {order.tradeInCreditPence ? (
                <>
                  <dt>Trade-in credit ({order.tradeInReference})</dt>
                  <dd className="text-right">−{formatPrice(order.tradeInCreditPence)}</dd>
                </>
              ) : null}
              <dt className="font-semibold">Total</dt>
              <dd className="text-right font-semibold">{formatPrice(order.totalPence)}</dd>
            </dl>
          </Section>
          {can(staff.role, "refunds.issue") && refundable > 0 ? (
            <Section title="Refund">
              <RefundForm orderId={order.id} refundablePence={refundable} />
            </Section>
          ) : null}
        </div>
        <div className="flex flex-col gap-6">
          <Section title="Customer">
            <p className="text-sm">
              {order.contactName ?? "—"}
              <span className="block break-all text-muted-foreground">{order.email}</span>
              <span className="block text-muted-foreground">{order.contactPhone}</span>
            </p>
            {owner?.customerId && can(staff.role, "customers.view") ? (
              <Link
                href={`/admin/customers/${owner.customerId}`}
                className="mt-2 inline-block text-sm text-primary underline"
              >
                View customer
              </Link>
            ) : null}
          </Section>
          <Section title="Payment">
            <p className="text-sm">
              {payment ? (
                <>
                  <StatusPill status={payment.status} /> {formatPrice(payment.amountPence)}
                  {payment.refundedPence ? (
                    <span className="block text-muted-foreground">
                      Refunded {formatPrice(payment.refundedPence)}
                    </span>
                  ) : null}
                </>
              ) : (
                "No payment"
              )}
            </p>
          </Section>
          {order.requests.length ? (
            <Section title="Returns and warranty">
              <ul className="flex flex-col gap-2 text-sm">
                {order.requests.map((r) => (
                  <li key={r.id}>
                    <Link href="/admin/returns" className="text-primary underline">
                      {r.reference}
                    </Link>{" "}
                    {r.type} · <StatusPill status={r.status} />
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      </div>
    </>
  );
}
