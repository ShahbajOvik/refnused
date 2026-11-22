// @vitest-environment node
import { randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";
import Stripe from "stripe";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  auditLog,
  orders,
  payments,
  payouts,
  products,
  stripeEvents,
} from "@refnused/database/db/schema";
import { seed } from "@refnused/database/db/seed";
import { sampleTradeInPence } from "@refnused/database/db/seed/catalogue";
import type { AppDb } from "@refnused/database/db/types";
import type { PaymentGateway, StripeEvent } from "@refnused/database/lib/payments/gateway";
import { verifyStripeWebhook } from "@refnused/database/lib/payments/gateway";
import { getSellModel } from "@refnused/database/lib/sell/catalogue";
import { createQuote, createQuoteSchema } from "@refnused/database/lib/sell/quote-service";
import { createTestDb, testCipher } from "@refnused/database/test/db";
import { withImeiCheckDigit } from "@refnused/database/lib/validation/uk";

import {
  CHECKOUT_HOLD_MINUTES,
  checkoutSchema,
  getBasketLines,
  previewCheckout,
  startCheckout,
  type CheckoutInput,
} from "@refnused/database/lib/orders/checkout-service";
import {
  createOrderRequest,
  getOrderByAccessToken,
  getOrderForMessages,
  orderRequestSchema,
} from "@refnused/database/lib/orders/order-service";
import { MIN_CARD_CHARGE_PENCE } from "@refnused/database/lib/orders/totals";
import { handleStripeEvent } from "./webhook-service";

let db: AppDb;
let close: () => Promise<void>;
const ids: Record<string, string> = {};

/** Records calls; cancellation can be made to fail like a processing payment. */
function fakeGateway() {
  const calls = { created: [] as string[], cancelled: [] as string[], refunded: [] as string[] };
  let counter = 0;
  const notCancelable = new Set<string>();
  const gateway: PaymentGateway = {
    mode: "standin",
    async createPaymentIntent(_input, key) {
      calls.created.push(key);
      const id = `pi_test_${++counter}_${randomBytes(3).toString("hex")}`;
      return { id, clientSecret: `${id}_secret_x` };
    },
    async cancelPaymentIntent(id) {
      if (notCancelable.has(id)) return "not_cancelable";
      calls.cancelled.push(id);
      return "canceled";
    },
    async refund(id) {
      calls.refunded.push(id);
    },
  };
  return { gateway, calls, notCancelable };
}

let imeiCounter = 500;
async function makeQuote(email: string) {
  const model = await getSellModel(db, "apple", "iphone-15");
  const variantId = model!.variants.find((v) => v.storageGb === 128 && v.colour === "Black")!.id;
  const result = await createQuote(
    db,
    createQuoteSchema.parse({
      variantId,
      answers: {
        network: "unlocked",
        powers_on: "yes",
        screen: "perfect",
        body: "perfect",
        battery: "good",
        biometrics: "works",
      },
      expectedOfferPence: sampleTradeInPence(26000, 0, "A"),
      delivery: { method: "postage_pack" },
      name: "Jo Bloggs",
      email,
      phone: "07700 900123",
      address: { line1: "1 Test Street", town: "North Shields", postcode: "NE29 6RR" },
      imei: withImeiCheckDigit(`3522222222${String(imeiCounter++).padStart(4, "0")}`),
      bank: { accountHolderName: "Jo Bloggs", sortCode: "12-34-56", accountNumber: "12345678" },
      declarations: { owner: true, activationLockOff: true },
    }),
    { cipher: testCipher() },
  );
  if (!result.ok) throw new Error(`quote failed: ${result.reason}`);
  return result;
}

const cipher = testCipher();
const start = (
  gateway: PaymentGateway,
  input: CheckoutInput & { productIds: string[] },
  options: Omit<Parameters<typeof startCheckout>[3], "cipher"> = {},
) => startCheckout(db, gateway, input, { cipher, ...options });

const uniqueEmail = () => `buyer.${randomBytes(4).toString("hex")}@example.co.uk`;

function checkout(overrides: Partial<CheckoutInput> = {}): CheckoutInput {
  return checkoutSchema.parse({
    email: uniqueEmail(),
    name: "Sam Buyer",
    phone: "07700 900456",
    fulfilment: {
      method: "delivery",
      deliveryOption: "tracked-48",
      address: { line1: "2 Test Road", town: "Tynemouth", postcode: "ne30 4aa" },
    },
    ...overrides,
  });
}

function intentEvent(
  type: string,
  intent: { id: string; amount_received?: number; currency?: string },
  eventId = `evt_${randomBytes(6).toString("hex")}`,
): StripeEvent {
  return {
    id: eventId,
    object: "event",
    type,
    livemode: false,
    data: { object: { object: "payment_intent", currency: "gbp", ...intent } },
  } as unknown as StripeEvent;
}

async function productId(slug: string) {
  const [row] = await db.select({ id: products.id }).from(products).where(eq(products.slug, slug));
  return row!.id;
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seed(db);
  for (const slug of [
    "iphone-15-128gb-black-k3x9q2",
    "galaxy-a55-128gb-awesome-navy-w4f7yh",
    "pixel-9-128gb-obsidian-p2h8vd",
    "iphone-13-128gb-midnight-r5n3wk",
    "pixel-8a-128gb-bay-s6x2bg",
    "iphone-15-128gb-yellow-y8c5gn",
  ]) {
    ids[slug] = await productId(slug);
  }
});
afterAll(() => close?.());

describe("previewCheckout", () => {
  it("prices delivery and collection on the server", async () => {
    const productIds = [ids["iphone-15-128gb-black-k3x9q2"]!];
    const delivery = await previewCheckout(db, {
      productIds,
      fulfilment: { method: "delivery", deliveryOption: "next-day" },
    });
    expect(delivery.ok && delivery.preview.totals).toMatchObject({
      subtotalPence: 46900,
      deliveryPence: 599,
      totalPence: 47499,
    });
    const collect = await previewCheckout(db, {
      productIds,
      fulfilment: { method: "click_and_collect", storeSlug: "fairtech-south-shields" },
    });
    expect(collect.ok && collect.preview).toMatchObject({
      totals: { deliveryPence: 0, totalPence: 46900 },
      collection: { storeName: "FairTech", sameDay: false },
    });
  });

  it("marks sold units unavailable and rejects unknown stores", async () => {
    const lines = await getBasketLines(db, [ids["iphone-15-128gb-yellow-y8c5gn"]!]);
    expect(lines[0]!.available).toBe(false);
    const result = await previewCheckout(db, {
      productIds: [ids["iphone-15-128gb-black-k3x9q2"]!],
      fulfilment: { method: "click_and_collect", storeSlug: "nowhere" },
    });
    expect(result).toEqual({ ok: false, reason: "unknown_store" });
  });

  it("only credits a trade-in to the email that got the quote", async () => {
    const email = uniqueEmail();
    const quote = await makeQuote(email);
    const base = {
      productIds: [ids["iphone-15-128gb-black-k3x9q2"]!],
      fulfilment: { method: "delivery" as const, deliveryOption: "tracked-48" },
      tradeInReference: quote.reference,
    };
    const other = await previewCheckout(db, { ...base, email: uniqueEmail() });
    expect(other.ok && other.preview.tradeIn).toEqual({ ok: false, reason: "not_found" });
    const own = await previewCheckout(db, { ...base, email });
    expect(own.ok && own.preview.totals).toMatchObject({
      tradeInCreditPence: quote.offerPence,
      totalPence: 46900 - quote.offerPence,
    });
  });
});

describe("startCheckout and the 15-minute hold", () => {
  it("creates a pending order, holds the unit and creates one payment intent", async () => {
    const { gateway, calls } = fakeGateway();
    const now = new Date();
    const result = await start(
      gateway,
      { ...checkout(), productIds: [ids["galaxy-a55-128gb-awesome-navy-w4f7yh"]!] },
      { now },
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.expiresAt.getTime() - now.getTime()).toBe(CHECKOUT_HOLD_MINUTES * 60_000);
    expect(calls.created).toEqual([`order:${result.orderId}:payment-intent`]);

    const [order] = await db.select().from(orders).where(eq(orders.id, result.orderId));
    expect(order).toMatchObject({ status: "pending_payment", totalPence: 15900, deliveryPence: 0 });
    expect(order!.accessTokenHash).not.toBe(result.accessToken);
    const [unit] = await db
      .select()
      .from(products)
      .where(eq(products.id, ids["galaxy-a55-128gb-awesome-navy-w4f7yh"]!));
    expect(unit).toMatchObject({ status: "listed", checkoutHoldOrderId: result.orderId });
  });

  it("won't sell a held unit to someone else until the hold expires", async () => {
    const { gateway, calls } = fakeGateway();
    const unit = [ids["pixel-9-128gb-obsidian-p2h8vd"]!];
    const now = new Date();
    const first = await start(gateway, { ...checkout(), productIds: unit }, { now });
    if (!first.ok) throw new Error(first.reason);

    const second = await start(
      gateway,
      { ...checkout(), productIds: unit },
      { now: new Date(now.getTime() + 5 * 60_000) },
    );
    expect(second).toMatchObject({ ok: false, reason: "unavailable" });

    // After 15 minutes the first payment intent is cancelled and the unit moves on.
    const later = new Date(now.getTime() + 16 * 60_000);
    const third = await start(gateway, { ...checkout(), productIds: unit }, { now: later });
    expect(third.ok).toBe(true);
    expect(calls.cancelled).toEqual([first.paymentIntentId]);
    const [old] = await db.select().from(orders).where(eq(orders.id, first.orderId));
    expect(old!.status).toBe("cancelled");
  });

  it("lets the same browser start again, replacing its own attempt", async () => {
    const { gateway } = fakeGateway();
    const unit = [ids["iphone-13-128gb-midnight-r5n3wk"]!];
    const first = await start(gateway, { ...checkout(), productIds: unit });
    if (!first.ok) throw new Error(first.reason);
    const again = await start(
      gateway,
      { ...checkout(), productIds: unit },
      { previousAccessToken: first.accessToken },
    );
    expect(again.ok).toBe(true);
  });

  it("keeps a unit whose expired payment is still processing (e.g. Klarna)", async () => {
    const { gateway, notCancelable } = fakeGateway();
    const unit = [ids["pixel-8a-128gb-bay-s6x2bg"]!];
    const now = new Date();
    const first = await start(gateway, { ...checkout(), productIds: unit }, { now });
    if (!first.ok) throw new Error(first.reason);
    notCancelable.add(first.paymentIntentId);
    const second = await start(
      gateway,
      { ...checkout(), productIds: unit },
      { now: new Date(now.getTime() + 20 * 60_000) },
    );
    expect(second).toMatchObject({ ok: false, reason: "unavailable" });
  });

  it("releases the hold if the payment intent can't be created", async () => {
    const { gateway } = fakeGateway();
    gateway.createPaymentIntent = async () => {
      throw new Error("Stripe is down");
    };
    const unit = ids["iphone-15-128gb-black-k3x9q2"]!;
    const result = await start(gateway, { ...checkout(), productIds: [unit] });
    expect(result).toEqual({ ok: false, reason: "payment_unavailable" });
    const [row] = await db.select().from(products).where(eq(products.id, unit));
    expect(row!.checkoutHoldOrderId).toBeNull();
  });
});

describe("Stripe webhooks", () => {
  let fx: ReturnType<typeof fakeGateway>;
  beforeEach(() => {
    fx = fakeGateway();
  });

  async function freshOrder(slug: string, overrides: Partial<CheckoutInput> = {}) {
    // Make the unit buyable again for each test.
    await db
      .update(products)
      .set({ status: "listed", soldAt: null, checkoutHoldOrderId: null, checkoutHoldUntil: null })
      .where(eq(products.id, ids[slug]!));
    const result = await start(fx.gateway, {
      ...checkout(overrides),
      productIds: [ids[slug]!],
    });
    if (!result.ok) throw new Error(result.reason);
    return result;
  }

  it("verifies Stripe's signature", () => {
    const secret = "whsec_test_secret";
    const payload = JSON.stringify({ id: "evt_1", object: "event", type: "ping" });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(verifyStripeWebhook(payload, header, secret).id).toBe("evt_1");
    expect(() => verifyStripeWebhook(payload, header, "whsec_other")).toThrow();
    expect(() => verifyStripeWebhook(payload.replace("ping", "pong"), header, secret)).toThrow();
  });

  it("marks the order paid and the unit sold, once", async () => {
    const order = await freshOrder("iphone-15-128gb-black-k3x9q2");
    const event = intentEvent("payment_intent.succeeded", {
      id: order.paymentIntentId,
      amount_received: 46900,
    });
    expect(await handleStripeEvent(db, event)).toMatchObject({
      kind: "paid",
      orderId: order.orderId,
    });
    // Redelivery of the same event does nothing.
    expect(await handleStripeEvent(db, event)).toEqual({ kind: "duplicate" });

    const [row] = await db.select().from(orders).where(eq(orders.id, order.orderId));
    expect(row).toMatchObject({ status: "paid", expiresAt: null });
    expect(row!.placedAt).toBeInstanceOf(Date);
    const [unit] = await db
      .select()
      .from(products)
      .where(eq(products.id, ids["iphone-15-128gb-black-k3x9q2"]!));
    expect(unit).toMatchObject({ status: "sold", checkoutHoldOrderId: null });
    const events = await db.select().from(stripeEvents).where(eq(stripeEvents.id, event.id));
    expect(events).toHaveLength(1);
    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "order.paid"), eq(auditLog.entityId, order.orderId)));
    expect(audits).toHaveLength(1);

    // The confirmation email can link to the order with the customer's token.
    const forMessages = await getOrderForMessages(db, order.orderId, cipher);
    expect(forMessages?.accessToken).toBe(order.accessToken);
    expect(forMessages?.message).toMatchObject({
      totalPence: 46900,
      fulfilment: { method: "delivery" },
    });
  });

  it("doesn't mark paid when the amount or currency is wrong", async () => {
    const order = await freshOrder("iphone-15-128gb-black-k3x9q2");
    const outcome = await handleStripeEvent(
      db,
      intentEvent("payment_intent.succeeded", { id: order.paymentIntentId, amount_received: 100 }),
    );
    expect(outcome.kind).toBe("refund_needed");
    const [row] = await db.select().from(orders).where(eq(orders.id, order.orderId));
    expect(row!.status).toBe("pending_payment");

    const eur = await handleStripeEvent(
      db,
      intentEvent("payment_intent.succeeded", {
        id: order.paymentIntentId,
        amount_received: 46900,
        currency: "eur",
      }),
    );
    expect(eur.kind).toBe("refund_needed");
  });

  it("refunds a late payment for a unit someone else has bought", async () => {
    const now = new Date();
    const slug = "iphone-15-128gb-black-k3x9q2";
    await db
      .update(products)
      .set({ status: "listed", checkoutHoldOrderId: null, checkoutHoldUntil: null })
      .where(eq(products.id, ids[slug]!));
    const late = await start(fx.gateway, { ...checkout(), productIds: [ids[slug]!] }, { now });
    if (!late.ok) throw new Error(late.reason);
    // Someone else takes it after the hold expires and pays.
    const winner = await start(
      fx.gateway,
      { ...checkout(), productIds: [ids[slug]!] },
      { now: new Date(now.getTime() + 20 * 60_000) },
    );
    if (!winner.ok) throw new Error(winner.reason);
    await handleStripeEvent(
      db,
      intentEvent("payment_intent.succeeded", {
        id: winner.paymentIntentId,
        amount_received: 46900,
      }),
    );
    const outcome = await handleStripeEvent(
      db,
      intentEvent("payment_intent.succeeded", { id: late.paymentIntentId, amount_received: 46900 }),
    );
    expect(outcome).toEqual({
      kind: "refund_needed",
      orderId: late.orderId,
      paymentIntentId: late.paymentIntentId,
    });
  });

  it("keeps the units longer while a payment is processing, and frees them if it's cancelled", async () => {
    const order = await freshOrder("galaxy-a55-128gb-awesome-navy-w4f7yh");
    await handleStripeEvent(
      db,
      intentEvent("payment_intent.processing", { id: order.paymentIntentId }),
    );
    const [held] = await db
      .select()
      .from(products)
      .where(eq(products.id, ids["galaxy-a55-128gb-awesome-navy-w4f7yh"]!));
    expect(held!.checkoutHoldUntil!.getTime()).toBeGreaterThan(Date.now() + 24 * 3_600_000);

    await handleStripeEvent(
      db,
      intentEvent("payment_intent.canceled", { id: order.paymentIntentId }),
    );
    const [row] = await db.select().from(orders).where(eq(orders.id, order.orderId));
    expect(row!.status).toBe("cancelled");
    const [freed] = await db
      .select()
      .from(products)
      .where(eq(products.id, ids["galaxy-a55-128gb-awesome-navy-w4f7yh"]!));
    expect(freed!.checkoutHoldOrderId).toBeNull();
  });

  it("records a failed attempt but keeps the order open to retry", async () => {
    const order = await freshOrder("galaxy-a55-128gb-awesome-navy-w4f7yh");
    await handleStripeEvent(
      db,
      intentEvent("payment_intent.payment_failed", {
        id: order.paymentIntentId,
        last_payment_error: { message: "Your card was declined." },
      } as never),
    );
    const [payment] = await db.select().from(payments).where(eq(payments.orderId, order.orderId));
    expect(payment).toMatchObject({
      status: "requires_payment",
      failureReason: "Your card was declined.",
    });
    const [row] = await db.select().from(orders).where(eq(orders.id, order.orderId));
    expect(row!.status).toBe("pending_payment");
  });

  it("uses a trade-in as credit and reduces the bank payout", async () => {
    const email = uniqueEmail();
    const quote = await makeQuote(email);
    const order = await freshOrder("iphone-15-128gb-black-k3x9q2", {
      email,
      tradeInReference: quote.reference,
    });
    expect(order.preview.totals.tradeInCreditPence).toBe(quote.offerPence);
    const total = 46900 - quote.offerPence;
    await handleStripeEvent(
      db,
      intentEvent("payment_intent.succeeded", {
        id: order.paymentIntentId,
        amount_received: total,
      }),
    );
    const [payout] = await db.select().from(payouts).where(eq(payouts.quoteId, quote.quoteId));
    expect(payout).toMatchObject({ status: "cancelled" });

    // The same quote can't be used again.
    const again = await previewCheckout(db, {
      email,
      productIds: [ids["pixel-8a-128gb-bay-s6x2bg"]!],
      fulfilment: { method: "delivery", deliveryOption: "tracked-48" },
      tradeInReference: quote.reference,
    });
    expect(again.ok && again.preview.tradeIn).toEqual({ ok: false, reason: "in_use" });
  });

  it("pays out what's left when the trade-in is worth more than the order", async () => {
    const email = uniqueEmail();
    const quote = await makeQuote(email);
    const order = await freshOrder("galaxy-a55-128gb-awesome-navy-w4f7yh", {
      email,
      tradeInReference: quote.reference,
    });
    expect(order.preview.totals.totalPence).toBe(MIN_CARD_CHARGE_PENCE);
    await handleStripeEvent(
      db,
      intentEvent("payment_intent.succeeded", {
        id: order.paymentIntentId,
        amount_received: MIN_CARD_CHARGE_PENCE,
      }),
    );
    const [payout] = await db.select().from(payouts).where(eq(payouts.quoteId, quote.quoteId));
    expect(payout).toMatchObject({
      status: "pending",
      amountPence: quote.offerPence - (15900 - MIN_CARD_CHARGE_PENCE),
    });
  });

  it("records refunds from charge.refunded", async () => {
    const order = await freshOrder("galaxy-a55-128gb-awesome-navy-w4f7yh");
    await handleStripeEvent(
      db,
      intentEvent("payment_intent.succeeded", {
        id: order.paymentIntentId,
        amount_received: 15900,
      }),
    );
    await handleStripeEvent(db, {
      id: `evt_${randomBytes(6).toString("hex")}`,
      object: "event",
      type: "charge.refunded",
      livemode: false,
      data: {
        object: {
          object: "charge",
          payment_intent: order.paymentIntentId,
          amount: 15900,
          amount_refunded: 15900,
        },
      },
    } as unknown as StripeEvent);
    const [row] = await db.select().from(orders).where(eq(orders.id, order.orderId));
    expect(row!.status).toBe("refunded");
  });
});

describe("returns and warranty claims", () => {
  it("only allows requests on paid orders, within the window, one open per item", async () => {
    const { gateway } = fakeGateway();
    const slug = "iphone-13-128gb-midnight-r5n3wk";
    await db
      .update(products)
      .set({ status: "listed", checkoutHoldOrderId: null, checkoutHoldUntil: null })
      .where(eq(products.id, ids[slug]!));
    const order = await start(gateway, { ...checkout(), productIds: [ids[slug]!] });
    if (!order.ok) throw new Error(order.reason);

    const view = await getOrderByAccessToken(db, order.accessToken);
    const itemId = view!.items[0]!.id;
    const returnInput = orderRequestSchema.parse({
      type: "return",
      orderItemId: itemId,
      reason: "changed_mind",
      description: "It's a bit too big for me.",
    });
    expect(await createOrderRequest(db, order.accessToken, returnInput)).toEqual({
      ok: false,
      reason: "not_paid",
    });

    const paidAt = new Date();
    await handleStripeEvent(
      db,
      intentEvent("payment_intent.succeeded", {
        id: order.paymentIntentId,
        amount_received: 25900,
      }),
      { now: paidAt },
    );
    const created = await createOrderRequest(db, order.accessToken, returnInput, { now: paidAt });
    expect(created).toMatchObject({
      ok: true,
      type: "return",
      reference: expect.stringMatching(/^RU-R-/),
    });
    expect(await createOrderRequest(db, order.accessToken, returnInput, { now: paidAt })).toEqual({
      ok: false,
      reason: "already_open",
    });

    const warranty = orderRequestSchema.parse({
      type: "warranty",
      orderItemId: itemId,
      reason: "battery",
      description: "The battery drains overnight.",
    });
    const in15Days = new Date(paidAt.getTime() + 15 * 86_400_000);
    expect(
      await createOrderRequest(
        db,
        order.accessToken,
        { ...returnInput, reason: "faulty" },
        { now: in15Days },
      ),
    ).toMatchObject({ ok: false });
    expect(
      await createOrderRequest(db, order.accessToken, warranty, { now: in15Days }),
    ).toMatchObject({
      ok: true,
      reference: expect.stringMatching(/^RU-W-/),
    });
    expect(await createOrderRequest(db, "x".repeat(32), warranty)).toEqual({
      ok: false,
      reason: "unknown_order",
    });

    const after = await getOrderByAccessToken(db, order.accessToken);
    expect(after!.requests.map((r) => r.type)).toEqual(["return", "warranty"]);
    expect(after!.status).toBe("paid");
  });
});
