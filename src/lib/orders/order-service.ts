import { randomInt } from "node:crypto";

import { and, asc, eq } from "drizzle-orm";
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

import { hashAccessToken } from "./checkout-service";
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

/** The order behind a customer's private order link. */
export async function getOrderByAccessToken(
  db: AppDb,
  token: string,
  now: Date = new Date(),
): Promise<OrderView | null> {
  if (!TOKEN.test(token)) return null;
  const [order] = await db
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
    .where(eq(orders.accessTokenHash, hashAccessToken(token)))
    .limit(1);
  if (!order) return null;

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
    ...rest
  } = order;
  return {
    ...rest,
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

/** A return (within 14 days) or warranty claim, from the customer's order link. */
export async function createOrderRequest(
  db: AppDb,
  token: string,
  input: OrderRequestInput,
  options: { now?: Date; meta?: RequestMeta } = {},
): Promise<CreateOrderRequestResult> {
  const now = options.now ?? new Date();
  if (!TOKEN.test(token)) return { ok: false, reason: "unknown_order" };
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
    .where(
      and(eq(orders.accessTokenHash, hashAccessToken(token)), eq(orderItems.id, input.orderItemId)),
    )
    .limit(1);
  if (!row) {
    const [order] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.accessTokenHash, hashAccessToken(token)));
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
