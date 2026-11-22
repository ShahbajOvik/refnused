import { ExternalLinkIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { requireCustomer } from "@/auth/guards";
import { AccountPage } from "@/components/account/account-page";
import { Timeline } from "@/components/account/timeline";
import { OrderRequestForm } from "@/components/checkout/order-request-form";
import { Badge } from "@/components/ui/badge";
import { db } from "@refnused/database/db";
import { orderTimeline } from "@/lib/account/orders";
import { formatDate, formatPrice } from "@refnused/database/lib/format";
import { listCustomerOrders, type OrderView } from "@refnused/database/lib/orders/order-service";
import { RETURN_REASONS, WARRANTY_FAULTS } from "@refnused/database/lib/orders/requests";

import { createAccountOrderRequestAction } from "../actions";

export const metadata: Metadata = {
  title: "Your orders",
  robots: { index: false, follow: false },
};

export default function OrdersPage() {
  return (
    <AccountPage
      title="Your orders"
      href="/account/orders"
      intro="Track deliveries and collections, request a return within 14 days, or make a warranty claim."
    >
      <Orders />
    </AccountPage>
  );
}

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Waiting for payment",
  paid: "Paid",
  processing: "Being prepared",
  dispatched: "Dispatched",
  ready_for_collection: "Ready to collect",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  partially_refunded: "Partly refunded",
};

const REQUEST_STATUS: Record<string, string> = {
  submitted: "Received",
  approved: "Approved",
  rejected: "Declined",
  completed: "Completed",
  cancelled: "Cancelled",
};

async function Orders() {
  const user = await requireCustomer("/account/orders");
  const orders = await listCustomerOrders(db, user.id);
  if (orders.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border bg-muted/40 p-8 text-center">
        <p className="font-medium">No orders yet.</p>
        <Link
          href="/shop"
          className="mt-2 inline-block font-medium text-primary underline underline-offset-4"
        >
          Browse refurbished phones
        </Link>
      </div>
    );
  }
  return (
    <ul className="mt-6 flex flex-col gap-6">
      {orders.map((order) => (
        <li key={order.id}>
          <OrderCard order={order} />
        </li>
      ))}
    </ul>
  );
}

function OrderCard({ order }: { order: OrderView }) {
  return (
    <article aria-labelledby={`order-${order.id}`} className="rounded-2xl border p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`order-${order.id}`} className="text-lg font-semibold">
            Order {order.orderNumber}
          </h2>
          <p className="text-sm text-muted-foreground">
            {order.placedAt ? `Placed ${formatDate(order.placedAt)} · ` : ""}
            {formatPrice(order.totalPence)}
            {order.tradeInCreditPence
              ? ` after ${formatPrice(order.tradeInCreditPence)} trade-in credit`
              : ""}
          </p>
        </div>
        <Badge variant="secondary">{STATUS_LABEL[order.status] ?? order.status}</Badge>
      </div>

      <div className="mt-2 grid gap-6 md:grid-cols-2">
        <div>
          <Timeline steps={orderTimeline(order)} label={`Progress of order ${order.orderNumber}`} />
          {order.tracking?.url ? (
            <a
              href={order.tracking.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex min-h-11 items-center gap-1.5 font-medium text-primary underline underline-offset-4"
            >
              Track with {order.tracking.carrier}
              <ExternalLinkIcon className="size-4" aria-hidden />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : null}
        </div>
        <ul className="flex flex-col gap-2 text-sm">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-4">
              <Link href={item.productPath} className="underline-offset-4 hover:underline">
                {item.description}
              </Link>
              <span className="shrink-0">{formatPrice(item.unitPricePence)}</span>
            </li>
          ))}
        </ul>
      </div>

      {order.items.map((item) => {
        const requests = order.requests.filter((r) => r.orderItemId === item.id);
        const open = (type: string) =>
          requests.some((r) => r.type === type && ["submitted", "approved"].includes(r.status));
        const canReturn = item.returnEligibility.allowed && !open("return");
        const canClaim = item.warrantyEligibility.allowed && !open("warranty");
        if (!requests.length && !canReturn && !canClaim) return null;
        return (
          <details
            key={item.id}
            className="mt-6 rounded-xl border p-4"
            open={requests.length > 0 || undefined}
          >
            <summary className="cursor-pointer font-medium">
              Returns and warranty: {item.description}
            </summary>
            <p className="mt-2 text-sm text-muted-foreground">
              {item.returnEligibility.deadline && canReturn
                ? `Return by ${formatDate(item.returnEligibility.deadline)}. `
                : ""}
              {item.warrantyEligibility.deadline
                ? `Warranty until ${formatDate(item.warrantyEligibility.deadline)}.`
                : ""}
            </p>
            {requests.length ? (
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {requests.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{REQUEST_STATUS[r.status] ?? r.status}</Badge>
                    {r.type === "return" ? "Return" : "Warranty claim"} {r.reference}:{" "}
                    {r.type === "return"
                      ? RETURN_REASONS[r.reason as keyof typeof RETURN_REASONS]
                      : WARRANTY_FAULTS[r.reason as keyof typeof WARRANTY_FAULTS]}
                    , {formatDate(r.createdAt)}
                  </li>
                ))}
              </ul>
            ) : null}
            {item.returnEligibility.allowed || item.warrantyEligibility.allowed ? (
              <div className="mt-4 empty:hidden">
                <OrderRequestForm
                  submitAction={createAccountOrderRequestAction}
                  orderItemId={item.id}
                  itemName={item.description}
                  canReturn={canReturn}
                  canClaimWarranty={canClaim}
                />
              </div>
            ) : null}
          </details>
        );
      })}
    </article>
  );
}
