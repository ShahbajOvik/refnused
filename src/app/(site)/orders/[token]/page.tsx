import { CheckCircle2Icon, ClockIcon, StoreIcon, TruckIcon, XCircleIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { ClearBasket, OrderStatusRefresher } from "@/components/checkout/order-status-refresher";
import { OrderRequestForm } from "@/components/checkout/order-request-form";

import { createOrderRequestAction } from "../actions";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/db";
import { publicEnv } from "@/lib/env";
import { formatDate, formatPrice, telHref } from "@/lib/format";
import { getOrderByAccessToken, type OrderView } from "@/lib/orders/order-service";
import { RETURN_REASONS, RETURN_WINDOW_DAYS, WARRANTY_FAULTS } from "@/lib/orders/requests";

export const metadata: Metadata = {
  title: "Your order",
  description: "Your RefurbednUsed order.",
  robots: { index: false, follow: false },
  // The link is the key to the order: never send it to other sites.
  referrer: "no-referrer",
};

export default function OrderPage({ params, searchParams }: PageProps<"/orders/[token]">) {
  return (
    <div className="page-container max-w-5xl py-8">
      <Suspense fallback={<Skeleton className="h-[32rem] rounded-2xl" />}>
        <Order params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const PAID = new Set([
  "paid",
  "processing",
  "dispatched",
  "ready_for_collection",
  "completed",
  "partially_refunded",
]);

async function Order({ params, searchParams }: PageProps<"/orders/[token]">) {
  await connection();
  const { token } = await params;
  const order = await getOrderByAccessToken(db, token);
  if (!order) notFound();
  // Stripe adds redirect_status when it sends the customer back.
  const redirectStatus = (await searchParams).redirect_status;

  const paid = PAID.has(order.status);
  const waiting =
    order.status === "pending_payment" &&
    (order.paymentStatus === "processing" || redirectStatus === "succeeded");

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: `Order ${order.orderNumber}`, href: `/orders/${token}` },
        ]}
      />
      <OrderStatusRefresher waiting={waiting} />
      {paid ? <ClearBasket /> : null}
      <StatusBanner order={order} waiting={waiting} redirectStatus={redirectStatus} />

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <section aria-labelledby="items-heading" className="rounded-2xl border p-6">
          <h2 id="items-heading" className="text-xl font-semibold">
            Your order
          </h2>
          <ul className="mt-4 divide-y">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-4 py-3">
                <Link href={item.productPath} className="underline-offset-4 hover:underline">
                  {item.description}
                </Link>
                <span className="shrink-0">{formatPrice(item.unitPricePence)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 flex flex-col gap-2 border-t pt-4 text-sm">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd>{formatPrice(order.subtotalPence)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>{order.deliveryLabel ?? "Click and collect"}</dt>
              <dd>{order.deliveryPence ? formatPrice(order.deliveryPence) : "Free"}</dd>
            </div>
            {order.tradeInCreditPence ? (
              <div className="flex justify-between">
                <dt>Trade-in credit ({order.tradeInReference})</dt>
                <dd>−{formatPrice(order.tradeInCreditPence)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between border-t pt-3 text-base font-semibold">
              <dt>{paid ? "Total paid" : "Total"}</dt>
              <dd data-testid="order-total">{formatPrice(order.totalPence)}</dd>
            </div>
          </dl>
        </section>

        <aside className="flex h-fit flex-col gap-4 rounded-2xl border p-6 text-sm">
          {order.fulfilmentMethod === "delivery" && order.shippingAddress ? (
            <div>
              <h2 className="flex items-center gap-2 font-semibold">
                <TruckIcon className="size-4 text-primary" aria-hidden /> Delivery
              </h2>
              <p className="mt-2">{order.deliveryLabel}</p>
              <address className="mt-1 text-muted-foreground not-italic">
                {order.shippingAddress.name}
                <br />
                {order.shippingAddress.line1}
                {order.shippingAddress.line2 ? (
                  <>
                    <br />
                    {order.shippingAddress.line2}
                  </>
                ) : null}
                <br />
                {order.shippingAddress.town} {order.shippingAddress.postcode}
              </address>
            </div>
          ) : order.collectionStore ? (
            <div>
              <h2 className="flex items-center gap-2 font-semibold">
                <StoreIcon className="size-4 text-primary" aria-hidden /> Click and collect
              </h2>
              <p className="mt-2">
                {order.collectionStore.name}, {order.collectionStore.town}
              </p>
              <address className="mt-1 text-muted-foreground not-italic">
                {order.collectionStore.street}
                <br />
                {order.collectionStore.town} {order.collectionStore.postcode}
              </address>
              <a
                href={telHref(order.collectionStore.phone)}
                className="mt-2 inline-block font-medium text-primary underline underline-offset-4"
              >
                Call the store
              </a>
              <p className="mt-2 text-muted-foreground">
                We’ll text you when it’s ready. Bring photo ID and your order number.
              </p>
            </div>
          ) : null}
          <div>
            <h2 className="font-semibold">Contact</h2>
            <p className="mt-2 break-words text-muted-foreground">{order.email}</p>
          </div>
        </aside>
      </div>

      {paid ? <AfterSales order={order} token={token} /> : null}
    </>
  );
}

function StatusBanner({
  order,
  waiting,
  redirectStatus,
}: {
  order: OrderView;
  waiting: boolean;
  redirectStatus: string | string[] | undefined;
}) {
  const wrap = "mt-6 flex items-start gap-4 rounded-2xl border p-6";
  if (PAID.has(order.status)) {
    return (
      <div className={`${wrap} border-success/40 bg-success/10`}>
        <CheckCircle2Icon className="mt-1 size-7 shrink-0 text-success" aria-hidden />
        <div>
          <h1 className="text-3xl font-semibold">Thank you, your order is confirmed</h1>
          <p className="mt-1 text-muted-foreground">
            Order <strong className="text-foreground">{order.orderNumber}</strong>
            {order.placedAt ? `, paid on ${formatDate(order.placedAt)}` : ""}. We’ve emailed your
            confirmation to {order.email}.
          </p>
        </div>
      </div>
    );
  }
  if (order.status === "pending_payment") {
    const expired =
      !waiting &&
      order.paymentStatus === "requires_payment" &&
      order.expiresAt !== null &&
      order.expiresAt < new Date();
    const failed = redirectStatus === "failed" || Boolean(order.paymentFailure);
    return (
      <div className={wrap}>
        <ClockIcon className="mt-1 size-7 shrink-0 text-primary" aria-hidden />
        <div>
          <h1 className="text-3xl font-semibold">
            {waiting ? "We’re confirming your payment" : "Waiting for payment"}
          </h1>
          <p className="mt-1 text-muted-foreground" role="status">
            {waiting
              ? "This usually takes a few seconds. This page updates by itself."
              : failed
                ? `Your payment didn’t go through${order.paymentFailure ? `: ${order.paymentFailure}` : "."}`
                : expired
                  ? "Your 15-minute hold has ended."
                  : `Order ${order.orderNumber} is waiting for payment.`}
          </p>
          {!waiting ? (
            <Link
              href="/checkout"
              className="mt-3 inline-block font-medium text-primary underline underline-offset-4"
            >
              Go back to checkout
            </Link>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <div className={wrap}>
      <XCircleIcon className="mt-1 size-7 shrink-0 text-muted-foreground" aria-hidden />
      <div>
        <h1 className="text-3xl font-semibold">
          {order.status === "cancelled" ? "This order was cancelled" : "This order was refunded"}
        </h1>
        <p className="mt-1 text-muted-foreground">
          Order {order.orderNumber}. If you paid, the money goes back to your original payment
          method within 5–10 working days.
        </p>
      </div>
    </div>
  );
}

function AfterSales({ order, token }: { order: OrderView; token: string }) {
  return (
    <section aria-labelledby="after-sales-heading" className="mt-12">
      <h2 id="after-sales-heading" className="text-2xl font-semibold">
        Returns and warranty
      </h2>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Changed your mind? Return it within {RETURN_WINDOW_DAYS} days for a full refund. Something
        wrong later? Your warranty covers faults.
      </p>
      <ul className="mt-6 flex flex-col gap-6">
        {order.items.map((item) => {
          const requests = order.requests.filter((r) => r.orderItemId === item.id);
          const open = (type: string) =>
            requests.some((r) => r.type === type && ["submitted", "approved"].includes(r.status));
          const canReturn = item.returnEligibility.allowed && !open("return");
          const canClaim = item.warrantyEligibility.allowed && !open("warranty");
          return (
            <li key={item.id} className="rounded-2xl border p-6">
              <h3 className="font-semibold">{item.description}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {item.returnEligibility.deadline
                  ? `Returns until ${formatDate(item.returnEligibility.deadline)}. `
                  : ""}
                {item.warrantyEligibility.deadline
                  ? `Warranty until ${formatDate(item.warrantyEligibility.deadline)}.`
                  : ""}
              </p>
              {requests.length ? (
                <ul className="mt-3 flex flex-col gap-2 text-sm">
                  {requests.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{r.status}</Badge>
                      {r.type === "return" ? "Return" : "Warranty claim"} {r.reference}:{" "}
                      {r.type === "return"
                        ? RETURN_REASONS[r.reason as keyof typeof RETURN_REASONS]
                        : WARRANTY_FAULTS[r.reason as keyof typeof WARRANTY_FAULTS]}
                      , {formatDate(r.createdAt)}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-4">
                {item.returnEligibility.allowed || item.warrantyEligibility.allowed ? (
                  <OrderRequestForm
                    submitAction={createOrderRequestAction.bind(null, token)}
                    orderItemId={item.id}
                    itemName={item.description}
                    canReturn={canReturn}
                    canClaimWarranty={canClaim}
                    turnstileSiteKey={publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    The return and warranty periods for this phone have ended.
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
