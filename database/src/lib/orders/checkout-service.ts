import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";

import { and, eq, inArray, lte, or, sql } from "drizzle-orm";
import { z } from "zod";

import {
  brands,
  deviceModels,
  modelVariants,
  orderItems,
  orders,
  payments,
  payouts,
  products,
  quotes,
  stores,
  type PostalAddress,
} from "../../db/schema";
import { affectedRows, isUniqueViolation } from "../../db/results";
import type { AppDb } from "../../db/types";
import { DELIVERY_OPTIONS } from "../../config/shop";
import { recordAudit, type RequestMeta } from "../audit";
import type { FieldCipher } from "../crypto/field-encryption";
import { findOrCreateCustomer } from "../customers";
import type { PaymentGateway } from "../payments/gateway";
import { ukPhoneSchema, ukPostcodeSchema } from "../validation/uk";

import { MAX_BASKET_ITEMS } from "./basket";
import { calculateOrderTotals, type OrderTotals } from "./totals";
import { variantLabel } from "../shop/variant-label";

/*
 * Checkout: works out the price on the server, holds the units for 15
 * minutes and creates the Stripe PaymentIntent. Orders are only ever marked
 * paid by the webhook (webhook-service.ts).
 */

export const CHECKOUT_HOLD_MINUTES = 15;
/** Quote statuses whose value can be used as credit. */
const TRADE_IN_STATUSES = ["accepted", "received", "inspecting", "approved"] as const;

const deliveryKeys = DELIVERY_OPTIONS.map((o) => o.key) as [string, ...string[]];

export const addressSchema = z.object({
  line1: z.string().trim().min(1, "Enter the first line of the address").max(100),
  line2: z
    .string()
    .trim()
    .max(100)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  town: z.string().trim().min(1, "Enter the town or city").max(60),
  county: z
    .string()
    .trim()
    .max(60)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  postcode: ukPostcodeSchema,
});

export const fulfilmentSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("delivery"),
    deliveryOption: z.enum(deliveryKeys, "Choose a delivery option"),
    address: addressSchema,
  }),
  z.object({
    method: z.literal("click_and_collect"),
    storeSlug: z.string("Choose a store").regex(/^[a-z0-9-]{1,80}$/, "Choose a store"),
  }),
]);

export const tradeInRefSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^RU-Q-[0-9A-Z]{6}$/, "Enter a quote reference like RU-Q-7K2M9Q");

export const checkoutSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address, like name@example.co.uk").max(254)),
  name: z.string().trim().min(1, "Enter your full name").max(100),
  phone: ukPhoneSchema,
  fulfilment: fulfilmentSchema,
  tradeInReference: tradeInRefSchema.optional(),
});

export type CheckoutInput = z.output<typeof checkoutSchema>;

/** Preview only needs what affects the price. */
export const previewSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).optional(),
  fulfilment: z.discriminatedUnion("method", [
    z.object({ method: z.literal("delivery"), deliveryOption: z.enum(deliveryKeys) }),
    z.object({ method: z.literal("click_and_collect"), storeSlug: z.string().max(80) }),
  ]),
  tradeInReference: tradeInRefSchema.optional(),
});

/** Encryption context (AAD) for orders.access_token_encrypted. */
export const ACCESS_TOKEN_CONTEXT = "orders.access_token";

export function hashAccessToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateOrderNumber() {
  return `RU-${randomInt(100_000, 1_000_000)}`;
}

// Basket ----------------------------------------------------------------------

export type BasketLine = {
  productId: string;
  slug: string;
  brandSlug: string;
  description: string;
  model: string;
  pricePence: number;
  warrantyMonths: number;
  storeId: string;
  storeName: string;
  storeTown: string;
  /** True when it can be bought now (listed and not held by someone else). */
  available: boolean;
};

type ProductRow = {
  id: string;
  slug: string;
  brandSlug: string;
  brand: string;
  model: string;
  storageGb: number | null;
  configuration: string;
  colour: string;
  grade: "A" | "B" | "C";
  pricePence: number;
  warrantyMonths: number;
  status: string;
  storeId: string;
  storeName: string;
  storeTown: string;
  holdOrderId: string | null;
  holdUntil: Date | null;
};

async function loadProducts(db: AppDb, ids: string[]): Promise<ProductRow[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      brandSlug: brands.slug,
      brand: brands.name,
      model: deviceModels.name,
      storageGb: modelVariants.storageGb,
      configuration: modelVariants.configuration,
      colour: modelVariants.colour,
      grade: products.grade,
      pricePence: products.pricePence,
      warrantyMonths: products.warrantyMonths,
      status: products.status,
      storeId: stores.id,
      storeName: stores.name,
      storeTown: stores.town,
      holdOrderId: products.checkoutHoldOrderId,
      holdUntil: products.checkoutHoldUntil,
    })
    .from(products)
    .innerJoin(modelVariants, eq(products.variantId, modelVariants.id))
    .innerJoin(deviceModels, eq(modelVariants.modelId, deviceModels.id))
    .innerJoin(brands, eq(deviceModels.brandId, brands.id))
    .innerJoin(stores, eq(products.storeId, stores.id))
    .where(inArray(products.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

/** Pending orders that belong to this browser (its previous checkout attempt). */
async function ownOrderIds(db: AppDb, accessToken: string | null | undefined) {
  if (!accessToken) return new Set<string>();
  const rows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.accessTokenHash, hashAccessToken(accessToken)),
        eq(orders.status, "pending_payment"),
      ),
    );
  return new Set(rows.map((r) => r.id));
}

function isAvailable(p: ProductRow, mine: Set<string>, now: Date) {
  if (p.status !== "listed") return false;
  if (!p.holdOrderId || !p.holdUntil) return true;
  return p.holdUntil <= now || mine.has(p.holdOrderId);
}

function toLine(p: ProductRow, available: boolean): BasketLine {
  return {
    productId: p.id,
    slug: p.slug,
    brandSlug: p.brandSlug,
    description: `${p.brand} ${p.model}, ${variantLabel(p)}, Grade ${p.grade}`,
    model: `${p.brand} ${p.model}`,
    pricePence: p.pricePence,
    warrantyMonths: p.warrantyMonths,
    storeId: p.storeId,
    storeName: p.storeName,
    storeTown: p.storeTown,
    available,
  };
}

/** Basket contents with current prices and availability. Unknown ids are dropped. */
export async function getBasketLines(
  db: AppDb,
  ids: string[],
  options: { now?: Date; accessToken?: string | null } = {},
): Promise<BasketLine[]> {
  const now = options.now ?? new Date();
  const [rows, mine] = await Promise.all([
    loadProducts(db, ids.slice(0, MAX_BASKET_ITEMS)),
    ownOrderIds(db, options.accessToken),
  ]);
  return rows.map((p) => toLine(p, isAvailable(p, mine, now)));
}

// Trade-in --------------------------------------------------------------------

export type TradeInCheck =
  | { ok: true; quoteId: string; reference: string; valuePence: number; device: string }
  | { ok: false; reason: "not_found" | "not_eligible" | "expired" | "in_use" };

/**
 * A trade-in quote can be credited when it's the customer's (same email),
 * still open, within its price lock (unless we already have the phone),
 * and not used by another live order.
 */
export async function checkTradeIn(
  db: AppDb,
  input: { reference: string; email: string },
  now: Date,
): Promise<TradeInCheck> {
  const [quote] = await db
    .select({
      id: quotes.id,
      reference: quotes.reference,
      status: quotes.status,
      contactEmail: quotes.contactEmail,
      offeredPricePence: quotes.offeredPricePence,
      priceLockedUntil: quotes.priceLockedUntil,
      brand: brands.name,
      model: deviceModels.name,
      storageGb: modelVariants.storageGb,
      payoutStatus: payouts.status,
    })
    .from(quotes)
    .innerJoin(modelVariants, eq(quotes.variantId, modelVariants.id))
    .innerJoin(deviceModels, eq(modelVariants.modelId, deviceModels.id))
    .innerJoin(brands, eq(deviceModels.brandId, brands.id))
    .leftJoin(payouts, eq(payouts.quoteId, quotes.id))
    .where(eq(quotes.reference, input.reference))
    .limit(1);
  // Same answer for "no such quote" and "someone else's quote".
  if (!quote || quote.contactEmail?.toLowerCase() !== input.email.toLowerCase()) {
    return { ok: false, reason: "not_found" };
  }
  const [used] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.tradeInQuoteId, quote.id), sql`${orders.status} <> 'cancelled'`))
    .limit(1);
  if (used) return { ok: false, reason: "in_use" };
  if (
    !(TRADE_IN_STATUSES as readonly string[]).includes(quote.status) ||
    quote.payoutStatus !== "pending"
  ) {
    return { ok: false, reason: "not_eligible" };
  }
  if (quote.status === "accepted" && quote.priceLockedUntil < now) {
    return { ok: false, reason: "expired" };
  }
  return {
    ok: true,
    quoteId: quote.id,
    reference: quote.reference,
    valuePence: quote.offeredPricePence,
    device: `${quote.brand} ${quote.model}, ${quote.storageGb}GB`,
  };
}

// Preview ---------------------------------------------------------------------

export type CheckoutPreview = {
  lines: BasketLine[];
  totals: OrderTotals;
  deliveryLabel: string;
  /** Click and collect: whether every phone is already at that store. */
  collection?: { storeId: string; storeName: string; storeTown: string; sameDay: boolean };
  tradeIn?: TradeInCheck;
};

export type PreviewResult =
  { ok: true; preview: CheckoutPreview } | { ok: false; reason: "empty_basket" | "unknown_store" };

/** The full price, worked out on the server, before anything is created. */
export async function previewCheckout(
  db: AppDb,
  input: z.output<typeof previewSchema> & { productIds: string[]; accessToken?: string | null },
  now: Date = new Date(),
): Promise<PreviewResult> {
  const lines = await getBasketLines(db, input.productIds, {
    now,
    accessToken: input.accessToken,
  });
  if (lines.length === 0) return { ok: false, reason: "empty_basket" };

  let deliveryPence = 0;
  let deliveryLabel = "Click and collect";
  let collection: CheckoutPreview["collection"];
  if (input.fulfilment.method === "delivery") {
    const key = input.fulfilment.deliveryOption;
    const option = DELIVERY_OPTIONS.find((o) => o.key === key)!;
    deliveryPence = option.pricePence;
    deliveryLabel = option.label;
  } else {
    const [store] = await db
      .select({ id: stores.id, name: stores.name, town: stores.town })
      .from(stores)
      .where(and(eq(stores.slug, input.fulfilment.storeSlug), eq(stores.isActive, true)));
    if (!store) return { ok: false, reason: "unknown_store" };
    collection = {
      storeId: store.id,
      storeName: store.name,
      storeTown: store.town,
      sameDay: lines.every((l) => l.storeId === store.id),
    };
    deliveryLabel = `Click and collect from ${store.name}, ${store.town}`;
  }

  let tradeIn: TradeInCheck | undefined;
  if (input.tradeInReference && input.email) {
    tradeIn = await checkTradeIn(
      db,
      { reference: input.tradeInReference, email: input.email },
      now,
    );
  }

  const totals = calculateOrderTotals({
    itemPricesPence: lines.map((l) => l.pricePence),
    deliveryPence,
    tradeInValuePence: tradeIn?.ok ? tradeIn.valuePence : 0,
  });
  return { ok: true, preview: { lines, totals, deliveryLabel, collection, tradeIn } };
}

// Start checkout --------------------------------------------------------------

export type StartCheckoutResult =
  | {
      ok: true;
      orderId: string;
      orderNumber: string;
      /** Secret for the customer's order link. Only its hash is stored. */
      accessToken: string;
      paymentIntentId: string;
      clientSecret: string;
      expiresAt: Date;
      preview: CheckoutPreview;
    }
  | {
      ok: false;
      reason:
        | "empty_basket"
        | "unknown_store"
        | "unavailable"
        | "trade_in_invalid"
        | "payment_unavailable";
      unavailableProductIds?: string[];
      tradeIn?: TradeInCheck;
    };

class UnavailableError extends Error {}

/** Cancels pending orders (their payment intents first) and frees their units. */
export async function releaseOrders(
  db: AppDb,
  gateway: PaymentGateway,
  orderIds: string[],
): Promise<{ released: string[]; stuck: string[] }> {
  const released: string[] = [];
  const stuck: string[] = [];
  for (const orderId of orderIds) {
    const intents = await db
      .select({ id: payments.stripePaymentIntentId })
      .from(payments)
      .where(and(eq(payments.orderId, orderId), eq(payments.status, "requires_payment")));
    let cancelable = true;
    for (const intent of intents) {
      if (intent.id && (await gateway.cancelPaymentIntent(intent.id)) === "not_cancelable") {
        cancelable = false;
      }
    }
    if (!cancelable) {
      stuck.push(orderId);
      continue;
    }
    await db.transaction(async (tx) => {
      const cancelled = await tx
        .update(orders)
        .set({ status: "cancelled", expiresAt: null })
        .where(and(eq(orders.id, orderId), eq(orders.status, "pending_payment")));
      if (!affectedRows(cancelled)) return;
      await tx
        .update(payments)
        .set({ status: "cancelled" })
        .where(and(eq(payments.orderId, orderId), eq(payments.status, "requires_payment")));
      await tx
        .update(products)
        .set({ checkoutHoldOrderId: null, checkoutHoldUntil: null })
        .where(eq(products.checkoutHoldOrderId, orderId));
    });
    released.push(orderId);
  }
  return { released, stuck };
}

export async function startCheckout(
  db: AppDb,
  gateway: PaymentGateway,
  input: CheckoutInput & { productIds: string[] },
  options: {
    cipher: FieldCipher;
    now?: Date;
    previousAccessToken?: string | null;
    meta?: RequestMeta;
  },
): Promise<StartCheckoutResult> {
  const now = options.now ?? new Date();
  const result = await previewCheckout(
    db,
    {
      email: input.email,
      fulfilment:
        input.fulfilment.method === "delivery"
          ? { method: "delivery", deliveryOption: input.fulfilment.deliveryOption }
          : input.fulfilment,
      tradeInReference: input.tradeInReference,
      productIds: input.productIds,
      accessToken: options.previousAccessToken,
    },
    now,
  );
  if (!result.ok) return result;
  const { preview } = result;

  const unavailable = preview.lines.filter((l) => !l.available).map((l) => l.productId);
  if (unavailable.length)
    return { ok: false, reason: "unavailable", unavailableProductIds: unavailable };
  if (preview.tradeIn && !preview.tradeIn.ok) {
    return { ok: false, reason: "trade_in_invalid", tradeIn: preview.tradeIn };
  }

  // Take over expired holds (and this browser's own earlier attempt): their
  // payment intents are cancelled first, so they can never be charged.
  const productIds = preview.lines.map((l) => l.productId);
  // Only expired holds or our own: a fresh hold taken since the preview is
  // someone else's live checkout and is caught by the locked re-check below.
  const mine = [...(await ownOrderIds(db, options.previousAccessToken))];
  const holders = await db
    .selectDistinct({ orderId: products.checkoutHoldOrderId })
    .from(products)
    .where(
      and(
        inArray(products.id, productIds),
        sql`${products.checkoutHoldOrderId} is not null`,
        mine.length
          ? or(lte(products.checkoutHoldUntil, now), inArray(products.checkoutHoldOrderId, mine))
          : lte(products.checkoutHoldUntil, now),
      ),
    );
  const { stuck } = await releaseOrders(
    db,
    gateway,
    holders.flatMap((h) => (h.orderId ? [h.orderId] : [])),
  );
  if (stuck.length) {
    // A payment for those units is already going through.
    return { ok: false, reason: "unavailable", unavailableProductIds: productIds };
  }

  const accessToken = randomBytes(24).toString("base64url");
  const expiresAt = new Date(now.getTime() + CHECKOUT_HOLD_MINUTES * 60_000);
  const { totals } = preview;
  const shippingAddress: PostalAddress | null =
    input.fulfilment.method === "delivery"
      ? { name: input.name, ...input.fulfilment.address, country: "GB" }
      : null;

  let order: { id: string; orderNumber: string };
  try {
    order = await db.transaction(async (tx) => {
      const txDb = tx as unknown as AppDb;
      // Lock the units, then check nobody got there first.
      const locked = await tx
        .select({
          id: products.id,
          status: products.status,
          holdOrderId: products.checkoutHoldOrderId,
        })
        .from(products)
        .where(inArray(products.id, productIds))
        .for("update");
      if (
        locked.length !== productIds.length ||
        locked.some((p) => p.status !== "listed" || p.holdOrderId)
      ) {
        throw new UnavailableError();
      }

      const customer = await findOrCreateCustomer(txDb, {
        email: input.email,
        name: input.name,
        phone: input.phone,
      });

      let created: { id: string; orderNumber: string } | undefined;
      for (let attempt = 0; attempt < 5 && !created; attempt++) {
        const candidate = { id: randomUUID(), orderNumber: generateOrderNumber() };
        try {
          await tx.insert(orders).values({
            ...candidate,
            customerId: customer.id,
            email: input.email,
            contactName: input.name,
            contactPhone: input.phone,
            status: "pending_payment",
            fulfilmentMethod: input.fulfilment.method,
            deliveryOptionKey:
              input.fulfilment.method === "delivery" ? input.fulfilment.deliveryOption : null,
            collectionStoreId: preview.collection?.storeId ?? null,
            shippingAddress,
            subtotalPence: totals.subtotalPence,
            deliveryPence: totals.deliveryPence,
            tradeInQuoteId:
              preview.tradeIn?.ok && totals.tradeInCreditPence > 0 ? preview.tradeIn.quoteId : null,
            tradeInCreditPence: preview.tradeIn?.ok ? totals.tradeInCreditPence : 0,
            totalPence: totals.totalPence,
            accessTokenHash: hashAccessToken(accessToken),
            accessTokenEncrypted: options.cipher.encrypt(accessToken, ACCESS_TOKEN_CONTEXT),
            expiresAt,
          });
          created = candidate;
        } catch (error) {
          // Order number already taken: try another. (MySQL rolls back just
          // the failed statement, not the transaction.)
          if (!isUniqueViolation(error, "orders_order_number_unique")) throw error;
        }
      }
      if (!created) throw new Error("Could not generate a unique order number");

      await tx.insert(orderItems).values(
        preview.lines.map((l) => ({
          orderId: created!.id,
          productId: l.productId,
          description: l.description,
          unitPricePence: l.pricePence,
        })),
      );
      await tx
        .update(products)
        .set({ checkoutHoldOrderId: created.id, checkoutHoldUntil: expiresAt })
        .where(inArray(products.id, productIds));
      await recordAudit(
        txDb,
        {
          actorType: "customer",
          actorId: customer.id,
          action: "order.create",
          entityType: "order",
          entityId: created.id,
          changes: {
            after: {
              orderNumber: created.orderNumber,
              items: productIds.length,
              ...totals,
              fulfilment: input.fulfilment.method,
            },
          },
        },
        options.meta,
      );
      return created;
    });
  } catch (error) {
    if (error instanceof UnavailableError) {
      return { ok: false, reason: "unavailable", unavailableProductIds: productIds };
    }
    // Another live order took the trade-in quote in the meantime.
    if (isUniqueViolation(error, "orders_trade_in_quote_unique")) {
      return { ok: false, reason: "trade_in_invalid", tradeIn: { ok: false, reason: "in_use" } };
    }
    throw error;
  }

  let intent;
  try {
    intent = await gateway.createPaymentIntent(
      {
        amountPence: totals.totalPence,
        orderId: order.id,
        orderNumber: order.orderNumber,
        email: input.email,
      },
      `order:${order.id}:payment-intent`,
    );
  } catch (error) {
    console.error("[checkout] could not create payment intent", error);
    await releaseOrders(db, gateway, [order.id]);
    return { ok: false, reason: "payment_unavailable" };
  }
  await db.insert(payments).values({
    orderId: order.id,
    stripePaymentIntentId: intent.id,
    amountPence: totals.totalPence,
    status: "requires_payment",
  });

  return {
    ok: true,
    orderId: order.id,
    orderNumber: order.orderNumber,
    accessToken,
    paymentIntentId: intent.id,
    clientSecret: intent.clientSecret,
    expiresAt,
    preview,
  };
}
