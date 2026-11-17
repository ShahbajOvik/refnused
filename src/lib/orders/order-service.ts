import { randomInt } from "node:crypto";

import { and, asc, desc, eq, isNotNull, or, type SQL } from "drizzle-orm";
import { z } from "zod";

import {
  brands,
  deviceModels,
  modelVariants,
  orderItems,
  orderRequests,
  orders,
  payments,
  products,
  quotes,
  stores,
  type PostalAddress,
} from "@/db/schema";
import type { AppDb } from "@/db/types";
import { DELIVERY_OPTIONS } from "@/config/shop";
import { recordAudit, type RequestMeta } from "@/lib/audit";

import type { FieldCipher } from "@/lib/crypto/field-encryption";

import { ACCESS_TOKEN_CONTEXT, hashAccessToken } from "./checkout-service";
import type { OrderMessageInput } from "./messages";
import {
  requestEligibility,
  RETURN_REASONS,
  WARRANTY_FAULTS,
  type RequestEligibility,
} from "./requests";

const TOKEN = /^[\w-]{20,64}$/;

export type OrderView = {
  id: string;
  orderNumber: string;
  status: string;
  email: string;
  contactName: string | null;
  contactPhone: string | null;
  fulfilmentMethod: "delivery" | "click_and_collect";
  deliveryLabel: string | null;
  shippingAddress: PostalAddress | null;
  collectionStore: {
    name: string;
    street: string;
    town: string;
    postcode: string;
    phone: string;
  } | null;
  subtotalPence: number;
  deliveryPence: number;
  tradeInCreditPence: number;
  tradeInReference: string | null;
  totalPence: number;
  placedAt: Date | null;
  fulfilledAt: Date | null;
  readyForCollectionAt: Date | null;
  completedAt: Date | null;
  tracking: { carrier: string; number: string; url: string | null } | null;
  expiresAt: Date | null;
  createdAt: Date;
  paymentStatus: string | null;
  paymentFailure: string | null;
  items: {
    id: string;
    description: string;
    unitPricePence: number;
    warrantyMonths: number;
    productPath: string;
    returnEligibility: RequestEligibility;
    warrantyEligibility: RequestEligibility;
  }[];
  requests: {
    id: string;
    reference: string;
    orderItemId: string;
    type: "return" | "warranty";
    reason: string;
    status: string;
    createdAt: Date;
  }[];
};

/** Who is asking for an order: the holder of its private link, or the signed-in customer. */
export type OrderOwner = { token: string } | { customerId: string };

function ownerCondition(owner: OrderOwner): SQL | null {
  if ("token" in owner) {
    return TOKEN.test(owner.token)
      ? eq(orders.accessTokenHash, hashAccessToken(owner.token))
      : null;
  }
  return eq(orders.customerId, owner.customerId);
}

/** The order behind a customer's private order link. */
export async function getOrderByAccessToken(
  db: AppDb,
  token: string,
  now: Date = new Date(),
): Promise<OrderView | null> {
  const [order] = await loadOrderViews(db, { token }, now, { limit: 1 });
  return order ?? null;
}

/** A signed-in customer's orders (paid ones, plus any still waiting for payment), newest first. */
export async function listCustomerOrders(
  db: AppDb,
  customerId: string,
  now: Date = new Date(),
): Promise<OrderView[]> {
  return loadOrderViews(db, { customerId }, now, { placedOrPending: true });
}

async function loadOrderViews(
  db: AppDb,
  owner: OrderOwner,
  now: Date,
  options: { limit?: number; placedOrPending?: boolean } = {},
): Promise<OrderView[]> {
  const condition = ownerCondition(owner);
  if (!condition) return [];
  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      email: orders.email,
      contactName: orders.contactName,
      contactPhone: orders.contactPhone,
      fulfilmentMethod: orders.fulfilmentMethod,
      deliveryOptionKey: orders.deliveryOptionKey,
      shippingAddress: orders.shippingAddress,
      subtotalPence: orders.subtotalPence,
      deliveryPence: orders.deliveryPence,
      tradeInCreditPence: orders.tradeInCreditPence,
      tradeInReference: quotes.reference,
      totalPence: orders.totalPence,
      placedAt: orders.placedAt,
      fulfilledAt: orders.fulfilledAt,
      readyForCollectionAt: orders.readyForCollectionAt,
      completedAt: orders.completedAt,
      trackingCarrier: orders.trackingCarrier,
      trackingNumber: orders.trackingNumber,
      expiresAt: orders.expiresAt,
      createdAt: orders.createdAt,
      storeName: stores.name,
      storeStreet: stores.street,
      storeTown: stores.town,
      storePostcode: stores.postcode,
      storePhone: stores.phone,
    })
    .from(orders)
    .leftJoin(stores, eq(orders.collectionStoreId, stores.id))
    .leftJoin(quotes, eq(orders.tradeInQuoteId, quotes.id))
    .where(
      and(
        condition,
        options.placedOrPending
          ? or(isNotNull(orders.placedAt), eq(orders.status, "pending_payment"))
          : undefined,
      ),
    )
    .orderBy(desc(orders.createdAt))
    .limit(options.limit ?? 100);
  return Promise.all(rows.map((order) => toOrderView(db, order, now)));
}

async function toOrderView(
  db: AppDb,
  order: {
    id: string;
    status: string;
    placedAt: Date | null;
    fulfilledAt: Date | null;
    trackingCarrier: string | null;
    trackingNumber: string | null;
    storeName: string | null;
    storeStreet: string | null;
    storeTown: string | null;
    storePostcode: string | null;
    storePhone: string | null;
    deliveryOptionKey: string | null;
  } & Omit<
    OrderView,
    | "deliveryLabel"
    | "collectionStore"
    | "paymentStatus"
    | "paymentFailure"
    | "items"
    | "requests"
    | "tracking"
  >,
  now: Date,
): Promise<OrderView> {
  const [items, [payment], requests] = await Promise.all([
    db
      .select({
        id: orderItems.id,
        description: orderItems.description,
        unitPricePence: orderItems.unitPricePence,
        warrantyMonths: products.warrantyMonths,
        slug: products.slug,
        brandSlug: brands.slug,
      })
      .from(orderItems)
      .innerJoin(products, eq(orderItems.productId, products.id))
      .innerJoin(modelVariants, eq(products.variantId, modelVariants.id))
      .innerJoin(deviceModels, eq(modelVariants.modelId, deviceModels.id))
      .innerJoin(brands, eq(deviceModels.brandId, brands.id))
      .where(eq(orderItems.orderId, order.id))
      .orderBy(asc(orderItems.createdAt), asc(orderItems.id)),
    db
      .select({ status: payments.status, failureReason: payments.failureReason })
      .from(payments)
      .where(eq(payments.orderId, order.id))
      .orderBy(asc(payments.createdAt))
      .limit(1),
    db
      .select({
        id: orderRequests.id,
        reference: orderRequests.reference,
        orderItemId: orderRequests.orderItemId,
        type: orderRequests.type,
        reason: orderRequests.reason,
        status: orderRequests.status,
        createdAt: orderRequests.createdAt,
      })
      .from(orderRequests)
      .where(eq(orderRequests.orderId, order.id))
      .orderBy(asc(orderRequests.createdAt)),
  ]);

  const {
    storeName,
    storeStreet,
    storeTown,
    storePostcode,
    storePhone,
    deliveryOptionKey,
    trackingCarrier,
    trackingNumber,
    ...rest
  } = order;
  return {
    ...rest,
    tracking:
      trackingCarrier && trackingNumber
        ? {
            carrier: trackingCarrier,
            number: trackingNumber,
            url: trackingUrl(trackingCarrier, trackingNumber),
          }
        : null,
    deliveryLabel: DELIVERY_OPTIONS.find((o) => o.key === deliveryOptionKey)?.label ?? null,
    collectionStore: storeName
      ? {
          name: storeName,
          street: storeStreet!,
          town: storeTown!,
          postcode: storePostcode!,
          phone: storePhone!,
        }
      : null,
    paymentStatus: payment?.status ?? null,
    paymentFailure: payment?.failureReason ?? null,
    items: items.map((item) => ({
      id: item.id,
      description: item.description,
      unitPricePence: item.unitPricePence,
      warrantyMonths: item.warrantyMonths,
      productPath: `/shop/${item.brandSlug}/${item.slug}`,
      returnEligibility: requestEligibility("return", order, item, now),
      warrantyEligibility: requestEligibility("warranty", order, item, now),
    })),
    requests,
  };
}

/** Public tracking page for a carrier's tracking number, when we know the carrier. */
export function trackingUrl(carrier: string, number: string): string | null {
  const n = encodeURIComponent(number.trim());
  switch (carrier.toLowerCase().replace(/[\s_-]/g, "")) {
    case "royalmail":
      return `https://www.royalmail.com/track-your-item#/tracking-results/${n}`;
    case "dpd":
      return `https://track.dpd.co.uk/parcels/${n}`;
    case "evri":
      return `https://www.evri.com/track/parcel/${n}`;
    case "dhl":
      return `https://www.dhl.com/gb-en/home/tracking.html?tracking-id=${n}`;
    default:
      return null;
  }
}

// Returns and warranty claims ---------------------------------------------------

const returnReasons = Object.keys(RETURN_REASONS) as [string, ...string[]];
const warrantyFaults = Object.keys(WARRANTY_FAULTS) as [string, ...string[]];

export const orderRequestSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("return"),
    orderItemId: z.uuid(),
    reason: z.enum(returnReasons, "Choose a reason"),
    description: z
      .string()
      .trim()
      .min(10, "Tell us a little more (at least 10 characters)")
      .max(2000),
  }),
  z.object({
    type: z.literal("warranty"),
    orderItemId: z.uuid(),
    reason: z.enum(warrantyFaults, "Choose what’s wrong"),
    description: z.string().trim().min(10, "Describe the fault (at least 10 characters)").max(2000),
  }),
]);

export type OrderRequestInput = z.output<typeof orderRequestSchema>;

export type CreateOrderRequestResult =
  | { ok: true; reference: string; type: "return" | "warranty"; deadline: Date }
  | {
      ok: false;
      reason: "unknown_order" | "unknown_item" | "not_paid" | "window_closed" | "already_open";
    };

const REF_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function requestReference(type: "return" | "warranty") {
  let code = "";
  for (let i = 0; i < 6; i++) code += REF_ALPHABET[randomInt(REF_ALPHABET.length)];
  return `RU-${type === "return" ? "R" : "W"}-${code}`;
}

/**
 * A return (within 14 days) or warranty claim, from the order link (token)
 * or the signed-in customer's account.
 */
export async function createOrderRequest(
  db: AppDb,
  ownerOrToken: string | OrderOwner,
  input: OrderRequestInput,
  options: { now?: Date; meta?: RequestMeta } = {},
): Promise<CreateOrderRequestResult> {
  const now = options.now ?? new Date();
  const owner = typeof ownerOrToken === "string" ? { token: ownerOrToken } : ownerOrToken;
  const condition = ownerCondition(owner);
  if (!condition) return { ok: false, reason: "unknown_order" };
  const [row] = await db
    .select({
      orderId: orders.id,
      customerId: orders.customerId,
      status: orders.status,
      placedAt: orders.placedAt,
      fulfilledAt: orders.fulfilledAt,
      warrantyMonths: products.warrantyMonths,
    })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(and(condition, eq(orderItems.id, input.orderItemId)))
    .limit(1);
  if (!row) {
    const [order] = await db.select({ id: orders.id }).from(orders).where(condition).limit(1);
    return { ok: false, reason: order ? "unknown_item" : "unknown_order" };
  }
  const eligibility = requestEligibility(input.type, row, row, now);
  if (!eligibility.allowed) return { ok: false, reason: eligibility.reason };

  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = requestReference(input.type);
    try {
      const [created] = await db
        .insert(orderRequests)
        .values({
          reference,
          orderId: row.orderId,
          orderItemId: input.orderItemId,
          type: input.type,
          reason: input.reason,
          description: input.description,
        })
        .onConflictDoNothing({ target: orderRequests.reference })
        .returning({ id: orderRequests.id });
      if (!created) continue;
      await recordAudit(
        db,
        {
          actorType: "customer",
          actorId: row.customerId,
          action: input.type === "return" ? "order.return_requested" : "order.warranty_claimed",
          entityType: "order",
          entityId: row.orderId,
          changes: { after: { reference, reason: input.reason, orderItemId: input.orderItemId } },
        },
        options.meta,
      );
      return { ok: true, reference, type: input.type, deadline: eligibility.deadline };
    } catch (error) {
      // order_requests_open_unique: one open request of each type per item.
      const code =
        (error as { code?: string }).code ?? (error as { cause?: { code?: string } }).cause?.code;
      if (code === "23505") return { ok: false, reason: "already_open" };
      throw error;
    }
  }
  throw new Error("Could not generate a unique request reference");
}

// Confirmation messages --------------------------------------------------------

export type OrderForMessages = {
  email: string;
  phone: string | null;
  /** The customer's order link token, decrypted for the email. */
  accessToken: string | null;
  message: Omit<OrderMessageInput, "orderUrl">;
};

/** Everything the confirmation email and SMS need, after the webhook marks an order paid. */
export async function getOrderForMessages(
  db: AppDb,
  orderId: string,
  cipher: FieldCipher,
): Promise<OrderForMessages | null> {
  const [order] = await db
    .select({
      orderNumber: orders.orderNumber,
      email: orders.email,
      contactName: orders.contactName,
      contactPhone: orders.contactPhone,
      fulfilmentMethod: orders.fulfilmentMethod,
      deliveryOptionKey: orders.deliveryOptionKey,
      shippingAddress: orders.shippingAddress,
      subtotalPence: orders.subtotalPence,
      deliveryPence: orders.deliveryPence,
      tradeInCreditPence: orders.tradeInCreditPence,
      totalPence: orders.totalPence,
      accessTokenEncrypted: orders.accessTokenEncrypted,
      storeName: stores.name,
      storeStreet: stores.street,
      storeTown: stores.town,
      storePostcode: stores.postcode,
    })
    .from(orders)
    .leftJoin(stores, eq(orders.collectionStoreId, stores.id))
    .where(eq(orders.id, orderId));
  if (!order) return null;
  const items = await db
    .select({ description: orderItems.description, unitPricePence: orderItems.unitPricePence })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.createdAt), asc(orderItems.id));
  const a = order.shippingAddress;
  return {
    email: order.email,
    phone: order.contactPhone,
    accessToken: order.accessTokenEncrypted
      ? cipher.decrypt(order.accessTokenEncrypted, ACCESS_TOKEN_CONTEXT)
      : null,
    message: {
      name: order.contactName ?? "there",
      orderNumber: order.orderNumber,
      items,
      subtotalPence: order.subtotalPence,
      deliveryPence: order.deliveryPence,
      tradeInCreditPence: order.tradeInCreditPence,
      totalPence: order.totalPence,
      fulfilment:
        order.fulfilmentMethod === "delivery"
          ? {
              method: "delivery",
              label:
                DELIVERY_OPTIONS.find((o) => o.key === order.deliveryOptionKey)?.label ??
                "Delivery",
              address: a
                ? [a.line1, a.line2, a.town, a.postcode].filter(Boolean).join(", ")
                : "your address",
            }
          : {
              method: "click_and_collect",
              storeName: order.storeName ?? "our store",
              storeTown: order.storeTown ?? undefined,
              storeAddress: `${order.storeStreet}, ${order.storeTown} ${order.storePostcode}`,
            },
    },
  };
}
