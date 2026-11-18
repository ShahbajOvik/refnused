import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { timestamps } from "./_shared";
import { staffUsers } from "./people";
import { orderItems, orders } from "./shop";

/**
 * Stripe webhook events we've processed, keyed by Stripe's event id. A
 * redelivered event finds its row and is skipped (idempotency).
 */
export const stripeEvents = pgTable("stripe_events", {
  id: text().primaryKey(),
  type: text().notNull(),
  livemode: boolean().notNull(),
  processedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const orderRequestType = pgEnum("order_request_type", ["return", "warranty"]);

export const orderRequestStatus = pgEnum("order_request_status", [
  "submitted",
  "approved", // return label sent / repair booked
  "rejected",
  "completed", // refunded, repaired or replaced
  "cancelled",
]);

/** Returns (within 14 days) and warranty claims, one per order item. */
export const orderRequests = pgTable(
  "order_requests",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Customer-facing, e.g. RU-R-7K2M9Q (return) or RU-W-… (warranty). */
    reference: text().notNull().unique("order_requests_reference_unique"),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    orderItemId: uuid()
      .notNull()
      .references(() => orderItems.id, { onDelete: "restrict" }),
    type: orderRequestType().notNull(),
    /** Validated against RETURN_REASONS / WARRANTY_FAULTS in src/lib/orders/requests.ts. */
    reason: text().notNull(),
    description: text().notNull(),
    status: orderRequestStatus().notNull().default("submitted"),
    /** Staff notes, shown to staff only. */
    staffNotes: text(),
    resolvedById: uuid().references(() => staffUsers.id, { onDelete: "set null" }),
    resolvedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("order_requests_order_idx").on(t.orderId),
    index("order_requests_status_idx").on(t.status),
    // One open request of each type per item.
    uniqueIndex("order_requests_open_unique")
      .on(t.orderItemId, t.type)
      .where(sql`${t.status} in ('submitted', 'approved')`),
    check("order_requests_description_check", sql`length(${t.description}) between 10 and 2000`),
  ],
);
