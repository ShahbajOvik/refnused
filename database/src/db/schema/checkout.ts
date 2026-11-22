import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

import { enumType, id, NOW, timestamps, ts, uuidRef } from "./_shared";
import { staffUsers } from "./people";
import { orderItems, orders } from "./shop";

/**
 * Stripe webhook events we've processed, keyed by Stripe's event id. A
 * redelivered event finds its row and is skipped (idempotency).
 */
export const stripeEvents = mysqlTable("stripe_events", {
  id: varchar({ length: 255 }).primaryKey(),
  type: varchar({ length: 100 }).notNull(),
  livemode: boolean().notNull(),
  processedAt: ts().notNull().default(NOW),
});

export const orderRequestType = enumType(["return", "warranty"]);

export const orderRequestStatus = enumType([
  "submitted",
  "approved", // return label sent / repair booked
  "rejected",
  "completed", // refunded, repaired or replaced
  "cancelled",
]);

/** Returns (within 14 days) and warranty claims, one per order item. */
export const orderRequests = mysqlTable(
  "order_requests",
  {
    id: id(),
    /** Customer-facing, e.g. RU-R-7K2M9Q (return) or RU-W-… (warranty). */
    reference: varchar({ length: 32 }).notNull().unique("order_requests_reference_unique"),
    orderId: uuidRef()
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    orderItemId: uuidRef()
      .notNull()
      .references(() => orderItems.id, { onDelete: "restrict" }),
    type: orderRequestType().notNull(),
    /** Validated against RETURN_REASONS / WARRANTY_FAULTS in src/lib/orders/requests.ts. */
    reason: varchar({ length: 64 }).notNull(),
    description: text().notNull(),
    status: orderRequestStatus().notNull().default("submitted"),
    /** Staff notes, shown to staff only. */
    staffNotes: text(),
    resolvedById: uuidRef().references(() => staffUsers.id, { onDelete: "set null" }),
    resolvedAt: ts(),
    ...timestamps,
  },
  (t) => [
    index("order_requests_order_idx").on(t.orderId),
    index("order_requests_status_idx").on(t.status),
    // One open request of each type per item: the third part is NULL (never
    // clashes) unless the request is open.
    uniqueIndex("order_requests_open_unique").on(
      t.orderItemId,
      t.type,
      sql`(case when ${t.status} in ('submitted', 'approved') then 1 end)`,
    ),
    check(
      "order_requests_description_check",
      sql`char_length(${t.description}) between 10 and 2000`,
    ),
  ],
);
