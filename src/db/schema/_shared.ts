import { pgEnum, timestamp } from "drizzle-orm/pg-core";

/*
 * Conventions
 * - Column names are camelCase in TypeScript and snake_case in SQL
 *   (`casing: "snake_case"` in the client and drizzle.config.ts).
 * - Money is integer pence (`*Pence`), never floats. GBP only.
 * - Timestamps are `timestamptz`.
 * - IMEIs are 15 digits, stored as text so leading zeros survive.
 */

export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Postgres regex for a 15-digit IMEI. */
export const IMEI_PATTERN = "^[0-9]{15}$";

// Enums ---------------------------------------------------------------------

/** Cosmetic grade of a refurbished unit we sell. Mirrors src/lib/grades.ts. */
export const productGrade = pgEnum("product_grade", ["A", "B", "C"]);

/** Condition of a phone we buy. Same A/B/C scale as the shop, plus faulty. */
export const tradeInGrade = pgEnum("trade_in_grade", ["A", "B", "C", "faulty"]);

export const staffRole = pgEnum("staff_role", ["admin", "manager", "inspector", "store_staff"]);

export const quoteStatus = pgEnum("quote_status", [
  "offered", // instant quote shown, not yet accepted
  "accepted", // customer accepted, awaiting device
  "received", // device arrived
  "inspecting",
  "revised", // revised offer waiting for the customer's decision
  "approved", // ready to pay
  "paid",
  "returned", // device sent back to the customer
  "rejected", // e.g. failed CheckMEND
  "expired",
  "cancelled",
]);

export const deliveryMethod = pgEnum("delivery_method", [
  "freepost",
  "courier_collection",
  "store_drop_off",
]);

export const checkmendResult = pgEnum("checkmend_result", [
  "clear",
  "lost_or_stolen",
  "blocked",
  "finance_outstanding",
  "insurance_claim",
  "error",
]);

export const revisedOfferStatus = pgEnum("revised_offer_status", [
  "not_required",
  "pending",
  "accepted",
  "declined",
]);

export const productStatus = pgEnum("product_status", [
  "draft",
  "listed",
  "reserved",
  "sold",
  "returned",
  "withdrawn",
]);

export const orderStatus = pgEnum("order_status", [
  "pending_payment",
  "paid",
  "processing",
  "dispatched",
  "ready_for_collection",
  "completed",
  "cancelled",
  "refunded",
  "partially_refunded",
]);

export const fulfilmentMethod = pgEnum("fulfilment_method", ["delivery", "click_and_collect"]);

export const paymentStatus = pgEnum("payment_status", [
  "requires_payment",
  "processing",
  "succeeded",
  "failed",
  "cancelled",
  "refunded",
  "partially_refunded",
]);

export const payoutMethod = pgEnum("payout_method", ["bank_transfer", "in_store"]);

export const payoutStatus = pgEnum("payout_status", [
  "pending",
  "processing",
  "paid",
  "failed",
  "cancelled",
]);

export const priceAlertType = pgEnum("price_alert_type", ["shop", "trade_in"]);

export const reviewStatus = pgEnum("review_status", ["pending", "published", "rejected"]);

export const actorType = pgEnum("actor_type", ["staff", "customer", "system"]);
