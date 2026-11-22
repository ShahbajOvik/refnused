import { and, eq, inArray, sql } from "drizzle-orm";

import { orderItems, orders, payments, payouts, products, quotes, stripeEvents } from "@refnused/database/db/schema";
import type { AppDb } from "@refnused/database/db/types";
import { recordAudit } from "@refnused/database/lib/audit";
import type {
  PaymentGateway,
  StripeCharge,
  StripeEvent,
  StripePaymentIntent,
} from "@refnused/database/lib/payments/gateway";

/*
 * Stripe webhook handling. The only place an order becomes paid.
 *
 * Idempotency: each event id is recorded in stripe_events in the same
 * transaction as its effects, so a redelivered (or concurrent duplicate)
 * event changes nothing. If processing fails, nothing is recorded and
 * Stripe retries.
 */

/** While a delayed payment (e.g. Klarna) is processing, keep the units this long. */
export const PROCESSING_HOLD_HOURS = 72;

export type WebhookOutcome =
  | { kind: "duplicate" }
  | { kind: "ignored"; reason: string }
  | { kind: "paid"; orderId: string; productIds: string[] }
  | { kind: "refund_needed"; orderId: string; paymentIntentId: string }
  | { kind: "updated"; orderId: string };

type Tx = AppDb;

class DuplicateEvent extends Error {}

async function claimEvent(tx: Tx, event: StripeEvent) {
  const [row] = await tx
    .insert(stripeEvents)
    .values({ id: event.id, type: event.type, livemode: event.livemode })
    .onConflictDoNothing()
    .returning({ id: stripeEvents.id });
  if (!row) throw new DuplicateEvent();
}

async function findPayment(tx: Tx, paymentIntentId: string) {
  const [row] = await tx
    .select({
      paymentId: payments.id,
      paymentStatus: payments.status,
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      orderStatus: orders.status,
      totalPence: orders.totalPence,
      tradeInQuoteId: orders.tradeInQuoteId,
      tradeInCreditPence: orders.tradeInCreditPence,
      customerId: orders.customerId,
    })
    .from(payments)
    .innerJoin(orders, eq(payments.orderId, orders.id))
    .where(eq(payments.stripePaymentIntentId, paymentIntentId))
    .for("update", { of: orders })
    .limit(1);
  return row;
}

export async function handleStripeEvent(
  db: AppDb,
  event: StripeEvent,
  options: { now?: Date } = {},
): Promise<WebhookOutcome> {
  const now = options.now ?? new Date();
  try {
    return await db.transaction(async (transaction) => {
      const tx = transaction as unknown as Tx;
      await claimEvent(tx, event);
      switch (event.type) {
        case "payment_intent.succeeded":
          return paymentSucceeded(tx, event.data.object, now);
        case "payment_intent.processing":
          return paymentProcessing(tx, event.data.object, now);
        case "payment_intent.payment_failed":
          return paymentFailed(tx, event.data.object);
        case "payment_intent.canceled":
          return paymentCanceled(tx, event.data.object);
        case "charge.refunded":
          return chargeRefunded(tx, event.data.object);
        default:
          return { kind: "ignored", reason: `unhandled type ${event.type}` } as const;
      }
    });
  } catch (error) {
    if (error instanceof DuplicateEvent) return { kind: "duplicate" };
    throw error;
  }
}

async function paymentSucceeded(
  tx: Tx,
  intent: StripePaymentIntent,
  now: Date,
): Promise<WebhookOutcome> {
  const order = await findPayment(tx, intent.id);
  if (!order) return { kind: "ignored", reason: "unknown payment intent" };
  if (order.orderStatus !== "pending_payment" && order.orderStatus !== "cancelled") {
    return { kind: "ignored", reason: `order already ${order.orderStatus}` };
  }

  // Never trust an amount we didn't ask for.
  if (intent.currency !== "gbp" || intent.amount_received !== order.totalPence) {
    await recordAudit(tx, {
      actorType: "system",
      action: "order.payment_mismatch",
      entityType: "order",
      entityId: order.orderId,
      changes: {
        after: {
          expectedPence: order.totalPence,
          receivedPence: intent.amount_received,
          currency: intent.currency,
        },
      },
    });
    await tx
      .update(payments)
      .set({ status: "succeeded", failureReason: "Amount mismatch: needs review" })
      .where(eq(payments.id, order.paymentId));
    return { kind: "refund_needed", orderId: order.orderId, paymentIntentId: intent.id };
  }

  const items = await tx
    .select({ productId: orderItems.productId })
    .from(orderItems)
    .where(eq(orderItems.orderId, order.orderId));
  const productIds = items.map((i) => i.productId);
  const units = await tx
    .select({
      id: products.id,
      status: products.status,
      holdOrderId: products.checkoutHoldOrderId,
      holdUntil: products.checkoutHoldUntil,
    })
    .from(products)
    .where(inArray(products.id, productIds))
    .for("update");
  // Ours if still held for this order, or free (an expired hold nobody took).
  const stillOurs = units.every(
    (u) =>
      u.status === "listed" &&
      (u.holdOrderId === order.orderId ||
        !u.holdOrderId ||
        (u.holdUntil !== null && u.holdUntil <= now)),
  );

  await tx
    .update(payments)
    .set({ status: "succeeded", failureReason: null })
    .where(eq(payments.id, order.paymentId));

  if (!stillOurs || units.length !== productIds.length) {
    // Paid too late: someone else bought a unit. Refund in full.
    await tx
      .update(orders)
      .set({ status: "cancelled", expiresAt: null })
      .where(eq(orders.id, order.orderId));
    await tx
      .update(products)
      .set({ checkoutHoldOrderId: null, checkoutHoldUntil: null })
      .where(eq(products.checkoutHoldOrderId, order.orderId));
    await recordAudit(tx, {
      actorType: "system",
      action: "order.paid_unavailable",
      entityType: "order",
      entityId: order.orderId,
      changes: { after: { orderNumber: order.orderNumber, refund: order.totalPence } },
    });
    return { kind: "refund_needed", orderId: order.orderId, paymentIntentId: intent.id };
  }

  await tx
    .update(products)
    .set({ status: "sold", soldAt: now, checkoutHoldOrderId: null, checkoutHoldUntil: null })
    .where(inArray(products.id, productIds));
  await tx
    .update(orders)
    .set({ status: "paid", placedAt: now, expiresAt: null })
    .where(eq(orders.id, order.orderId));

  if (order.tradeInQuoteId) await applyTradeInCredit(tx, order);

  await recordAudit(tx, {
    actorType: "system",
    action: "order.paid",
    entityType: "order",
    entityId: order.orderId,
    changes: {
      after: {
        orderNumber: order.orderNumber,
        totalPence: order.totalPence,
        tradeInCreditPence: order.tradeInCreditPence,
      },
    },
  });
  return { kind: "paid", orderId: order.orderId, productIds };
}

/**
 * The trade-in's value has been spent on the order: only what's left (if
 * anything) is still paid to the customer's bank.
 */
async function applyTradeInCredit(
  tx: Tx,
  order: {
    orderId: string;
    orderNumber: string;
    tradeInQuoteId: string | null;
    tradeInCreditPence: number;
  },
) {
  const [payout] = await tx
    .select({ id: payouts.id, amountPence: payouts.amountPence, status: payouts.status })
    .from(payouts)
    .innerJoin(quotes, eq(payouts.quoteId, quotes.id))
    .where(eq(quotes.id, order.tradeInQuoteId!))
    .for("update", { of: payouts });
  if (!payout || payout.status !== "pending") return;
  const remaining = payout.amountPence - order.tradeInCreditPence;
  await tx
    .update(payouts)
    .set(
      remaining > 0
        ? { amountPence: remaining }
        : {
            status: "cancelled",
            failureReason: `Used in full as credit on order ${order.orderNumber}`,
          },
    )
    .where(eq(payouts.id, payout.id));
  await recordAudit(tx, {
    actorType: "system",
    action: "payout.order_credit",
    entityType: "payout",
    entityId: payout.id,
    changes: {
      before: { amountPence: payout.amountPence, status: payout.status },
      after: {
        orderNumber: order.orderNumber,
        creditPence: order.tradeInCreditPence,
        amountPence: Math.max(remaining, 0),
        status: remaining > 0 ? "pending" : "cancelled",
      },
    },
  });
}

async function paymentProcessing(
  tx: Tx,
  intent: StripePaymentIntent,
  now: Date,
): Promise<WebhookOutcome> {
  const order = await findPayment(tx, intent.id);
  if (!order || order.orderStatus !== "pending_payment") {
    return { kind: "ignored", reason: "no pending order" };
  }
  await tx.update(payments).set({ status: "processing" }).where(eq(payments.id, order.paymentId));
  // Keep the units while the bank or Klarna decides.
  const until = new Date(now.getTime() + PROCESSING_HOLD_HOURS * 3_600_000);
  await tx
    .update(products)
    .set({ checkoutHoldUntil: until })
    .where(eq(products.checkoutHoldOrderId, order.orderId));
  await tx.update(orders).set({ expiresAt: until }).where(eq(orders.id, order.orderId));
  return { kind: "updated", orderId: order.orderId };
}

async function paymentFailed(tx: Tx, intent: StripePaymentIntent): Promise<WebhookOutcome> {
  const order = await findPayment(tx, intent.id);
  if (!order || order.orderStatus !== "pending_payment") {
    return { kind: "ignored", reason: "no pending order" };
  }
  // The customer can try again while the hold lasts.
  await tx
    .update(payments)
    .set({
      status: "requires_payment",
      failureReason: intent.last_payment_error?.message?.slice(0, 500) ?? "Payment failed",
    })
    .where(eq(payments.id, order.paymentId));
  return { kind: "updated", orderId: order.orderId };
}

async function paymentCanceled(tx: Tx, intent: StripePaymentIntent): Promise<WebhookOutcome> {
  const order = await findPayment(tx, intent.id);
  if (!order) return { kind: "ignored", reason: "unknown payment intent" };
  await tx.update(payments).set({ status: "cancelled" }).where(eq(payments.id, order.paymentId));
  if (order.orderStatus === "pending_payment") {
    await tx
      .update(orders)
      .set({ status: "cancelled", expiresAt: null })
      .where(eq(orders.id, order.orderId));
    await tx
      .update(products)
      .set({ checkoutHoldOrderId: null, checkoutHoldUntil: null })
      .where(eq(products.checkoutHoldOrderId, order.orderId));
  }
  return { kind: "updated", orderId: order.orderId };
}

async function chargeRefunded(tx: Tx, charge: StripeCharge): Promise<WebhookOutcome> {
  const intentId =
    typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!intentId) return { kind: "ignored", reason: "charge without payment intent" };
  const order = await findPayment(tx, intentId);
  if (!order) return { kind: "ignored", reason: "unknown payment intent" };
  const full = charge.amount_refunded >= charge.amount;
  await tx
    .update(payments)
    .set({
      amountRefundedPence: sql`least(${charge.amount_refunded}, ${payments.amountPence})`,
      status: full ? "refunded" : "partially_refunded",
    })
    .where(eq(payments.id, order.paymentId));
  if (order.orderStatus !== "cancelled") {
    await tx
      .update(orders)
      .set({ status: full ? "refunded" : "partially_refunded" })
      .where(and(eq(orders.id, order.orderId)));
  }
  await recordAudit(tx, {
    actorType: "system",
    action: "order.refund",
    entityType: "order",
    entityId: order.orderId,
    changes: { after: { refundedPence: charge.amount_refunded, full } },
  });
  return { kind: "updated", orderId: order.orderId };
}

/** Refunds a payment we can't honour, after the webhook transaction. */
export async function refundUnfulfillable(
  gateway: PaymentGateway,
  outcome: Extract<WebhookOutcome, { kind: "refund_needed" }>,
) {
  await gateway.refund(outcome.paymentIntentId, `refund:${outcome.paymentIntentId}`);
}
