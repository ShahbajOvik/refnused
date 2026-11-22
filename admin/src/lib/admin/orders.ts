import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { z } from "zod";

import {
  orderItems,
  orderRequests,
  orders,
  orderStatus,
  payments,
  products,
  stores,
} from "@refnused/database/db/schema";
import type { AppDb } from "@refnused/database/db/types";
import { ActionError } from "@refnused/database/lib/action-error";
import { recordAudit, type RequestMeta } from "@refnused/database/lib/audit";
import type { PaymentGateway } from "@refnused/database/lib/payments/gateway";

/*
 * Order fulfilment, refunds, and returns/warranty requests for staff.
 *   delivery:   paid → processing → dispatched → completed (delivered)
 *   collection: paid → processing → ready_for_collection → completed
 */

export type OrderAdminRow = {
  id: string;
  orderNumber: string;
  status: string;
  email: string;
  contactName: string | null;
  fulfilmentMethod: "delivery" | "click_and_collect";
  storeName: string | null;
  totalPence: number;
  items: number;
  placedAt: Date | null;
};

export const ORDER_FILTERS = {
  to_fulfil: { label: "To fulfil", statuses: ["paid", "processing"] },
  in_transit: { label: "Dispatched / ready", statuses: ["dispatched", "ready_for_collection"] },
  done: { label: "Completed", statuses: ["completed"] },
  refunds: { label: "Refunded", statuses: ["refunded", "partially_refunded"] },
  unpaid: { label: "Unpaid / cancelled", statuses: ["pending_payment", "cancelled"] },
} as const satisfies Record<
  string,
  { label: string; statuses: (typeof orderStatus.enumValues)[number][] }
>;
export type OrderFilter = keyof typeof ORDER_FILTERS;

export async function listOrdersAdmin(
  db: AppDb,
  filter: OrderFilter,
  search?: string,
): Promise<OrderAdminRow[]> {
  const q = search?.trim();
  return db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      email: orders.email,
      contactName: orders.contactName,
      fulfilmentMethod: orders.fulfilmentMethod,
      storeName: sql<string | null>`concat(${stores.name}, ', ', ${stores.town})`,
      totalPence: orders.totalPence,
      items: sql<number>`(select count(*) from ${orderItems} where ${orderItems.orderId} = ${orders.id})`,
      placedAt: orders.placedAt,
    })
    .from(orders)
    .leftJoin(stores, eq(orders.collectionStoreId, stores.id))
    .where(
      and(
        inArray(orders.status, [...ORDER_FILTERS[filter].statuses]),
        q
          ? or(
              like(orders.orderNumber, `%${q}%`),
              like(orders.email, `%${q}%`),
              like(orders.contactName, `%${q}%`),
            )
          : undefined,
      ),
    )
    .orderBy(filter === "to_fulfil" ? orders.placedAt : desc(orders.createdAt))
    .limit(300);
}

export const fulfilmentSchema = z.discriminatedUnion("step", [
  z.object({ orderId: z.uuid(), step: z.literal("processing") }),
  z.object({
    orderId: z.uuid(),
    step: z.literal("dispatched"),
    carrier: z.string().trim().min(2, "Enter the carrier").max(40),
    trackingNumber: z
      .string()
      .trim()
      .min(4, "Enter the tracking number")
      .max(40)
      .regex(/^[A-Za-z0-9 -]+$/, "Letters, numbers, spaces and dashes only"),
  }),
  z.object({ orderId: z.uuid(), step: z.literal("ready_for_collection") }),
  z.object({ orderId: z.uuid(), step: z.literal("completed") }),
]);
export type FulfilmentInput = z.output<typeof fulfilmentSchema>;

const ALLOWED: Record<string, { delivery: string[]; click_and_collect: string[] }> = {
  processing: { delivery: ["paid"], click_and_collect: ["paid"] },
  dispatched: { delivery: ["paid", "processing"], click_and_collect: [] },
  ready_for_collection: { delivery: [], click_and_collect: ["paid", "processing"] },
  completed: { delivery: ["dispatched"], click_and_collect: ["ready_for_collection"] },
};

/** Moves an order on. Returns what to tell the customer, if anything. */
export async function advanceFulfilment(
  db: AppDb,
  input: FulfilmentInput & { staffId: string },
  meta?: RequestMeta,
  now = new Date(),
): Promise<{ notify: "dispatched" | "ready" | null }> {
  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as AppDb;
    const [order] = await tx
      .select({ status: orders.status, method: orders.fulfilmentMethod })
      .from(orders)
      .where(eq(orders.id, input.orderId))
      .for("update");
    if (!order) throw new ActionError("That order doesn’t exist.");
    if (!ALLOWED[input.step]![order.method].includes(order.status)) {
      throw new ActionError(
        `Can’t move a ${order.status.replace(/_/g, " ")} order to ${input.step.replace(/_/g, " ")}.`,
      );
    }
    const set: Partial<typeof orders.$inferInsert> = { status: input.step };
    if (input.step === "dispatched") {
      Object.assign(set, {
        fulfilledAt: now,
        trackingCarrier: input.carrier,
        trackingNumber: input.trackingNumber.toUpperCase(),
      });
    }
    if (input.step === "ready_for_collection") set.readyForCollectionAt = now;
    if (input.step === "completed") {
      set.completedAt = now;
      // Collected: the returns window starts now.
      if (order.method === "click_and_collect") set.fulfilledAt = now;
    }
    await tx.update(orders).set(set).where(eq(orders.id, input.orderId));
    await recordAudit(
      tx,
      {
        actorType: "staff",
        actorId: input.staffId,
        action: `order.${input.step}`,
        entityType: "order",
        entityId: input.orderId,
        changes: {
          before: { status: order.status },
          after: {
            status: input.step,
            ...(input.step === "dispatched"
              ? { carrier: input.carrier, trackingNumber: input.trackingNumber }
              : {}),
          },
        },
      },
      meta,
    );
    return {
      notify:
        input.step === "dispatched"
          ? "dispatched"
          : input.step === "ready_for_collection"
            ? "ready"
            : null,
    };
  });
}

export const refundSchema = z.object({
  orderId: z.uuid(),
  /** Pounds; empty means a full refund of what's left. */
  amountPounds: z
    .union([z.literal(""), z.coerce.number().positive().max(10_000)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : Math.round(v * 100))),
  reason: z.string().trim().min(3, "Give a reason").max(300),
});

/**
 * Asks Stripe for a refund. The order and payment are updated when the
 * charge.refunded webhook arrives (the source of truth).
 */
export async function requestRefund(
  db: AppDb,
  gateway: PaymentGateway,
  input: z.output<typeof refundSchema> & { staffId: string },
  meta?: RequestMeta,
) {
  const [payment] = await db
    .select({
      intentId: payments.stripePaymentIntentId,
      amountPence: payments.amountPence,
      refundedPence: payments.amountRefundedPence,
      status: payments.status,
      orderStatus: orders.status,
    })
    .from(payments)
    .innerJoin(orders, eq(payments.orderId, orders.id))
    .where(
      and(
        eq(payments.orderId, input.orderId),
        inArray(payments.status, ["succeeded", "partially_refunded"]),
      ),
    );
  if (!payment?.intentId) throw new ActionError("This order has no payment to refund.");
  const remaining = payment.amountPence - payment.refundedPence;
  const amount = input.amountPounds ?? remaining;
  if (amount <= 0 || amount > remaining) {
    throw new ActionError(`You can refund up to £${(remaining / 100).toFixed(2)}.`);
  }
  await gateway.refund(
    payment.intentId,
    `refund:${input.orderId}:${payment.refundedPence}:${amount}`,
    amount === payment.amountPence ? undefined : amount,
  );
  await recordAudit(
    db,
    {
      actorType: "staff",
      actorId: input.staffId,
      action: "order.refund_requested",
      entityType: "order",
      entityId: input.orderId,
      changes: { after: { amountPence: amount, reason: input.reason } },
    },
    meta,
  );
  return { amountPence: amount };
}

// Returns and warranty -----------------------------------------------------------

export type RequestAdminRow = {
  id: string;
  reference: string;
  type: "return" | "warranty";
  status: string;
  reason: string;
  description: string;
  staffNotes: string | null;
  createdAt: Date;
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  item: string;
  productId: string;
};

export async function listRequests(
  db: AppDb,
  options: { status: "open" | "closed"; type?: "return" | "warranty" },
): Promise<RequestAdminRow[]> {
  return db
    .select({
      id: orderRequests.id,
      reference: orderRequests.reference,
      type: orderRequests.type,
      status: orderRequests.status,
      reason: orderRequests.reason,
      description: orderRequests.description,
      staffNotes: orderRequests.staffNotes,
      createdAt: orderRequests.createdAt,
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      customerName: orders.contactName,
      item: orderItems.description,
      productId: orderItems.productId,
    })
    .from(orderRequests)
    .innerJoin(orders, eq(orderRequests.orderId, orders.id))
    .innerJoin(orderItems, eq(orderRequests.orderItemId, orderItems.id))
    .where(
      and(
        inArray(
          orderRequests.status,
          options.status === "open"
            ? ["submitted", "approved"]
            : ["rejected", "completed", "cancelled"],
        ),
        options.type ? eq(orderRequests.type, options.type) : undefined,
      ),
    )
    .orderBy(options.status === "open" ? orderRequests.createdAt : desc(orderRequests.updatedAt))
    .limit(300);
}

export const requestDecisionSchema = z.object({
  requestId: z.uuid(),
  decision: z.enum(["approved", "rejected", "completed"]),
  note: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => v || null),
});

/**
 * submitted → approved | rejected; approved → completed. Completing a
 * return puts the unit back as "returned" (re-check before relisting).
 * Refunds are a separate step (they need refunds.issue).
 */
export async function decideRequest(
  db: AppDb,
  input: z.output<typeof requestDecisionSchema> & { staffId: string },
  meta?: RequestMeta,
  now = new Date(),
) {
  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as AppDb;
    const [request] = await tx
      .select({
        status: orderRequests.status,
        type: orderRequests.type,
        orderId: orderRequests.orderId,
        orderItemId: orderRequests.orderItemId,
        reference: orderRequests.reference,
        staffNotes: orderRequests.staffNotes,
      })
      .from(orderRequests)
      .where(eq(orderRequests.id, input.requestId))
      .for("update");
    if (!request) throw new ActionError("That request doesn’t exist.");
    const allowed =
      (request.status === "submitted" &&
        (input.decision === "approved" || input.decision === "rejected")) ||
      (request.status === "approved" &&
        (input.decision === "completed" || input.decision === "rejected"));
    if (!allowed) throw new ActionError(`A ${request.status} request can’t be ${input.decision}.`);
    await tx
      .update(orderRequests)
      .set({
        status: input.decision,
        staffNotes: input.note
          ? [request.staffNotes, input.note].filter(Boolean).join("\n")
          : request.staffNotes,
        resolvedById: input.staffId,
        resolvedAt: input.decision === "approved" ? null : now,
      })
      .where(eq(orderRequests.id, input.requestId));
    if (input.decision === "completed" && request.type === "return") {
      const [item] = await tx
        .select({ productId: orderItems.productId })
        .from(orderItems)
        .where(eq(orderItems.id, request.orderItemId));
      if (item) {
        await tx
          .update(products)
          .set({ status: "returned" })
          .where(and(eq(products.id, item.productId), eq(products.status, "sold")));
      }
    }
    await recordAudit(
      tx,
      {
        actorType: "staff",
        actorId: input.staffId,
        action: `order_request.${input.decision}`,
        entityType: "order_request",
        entityId: input.requestId,
        changes: {
          before: { status: request.status },
          after: { status: input.decision, note: input.note, orderId: request.orderId },
        },
      },
      meta,
    );
    return { reference: request.reference, type: request.type, orderId: request.orderId };
  });
}
