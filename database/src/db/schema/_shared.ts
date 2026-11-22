import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { datetime, mysqlEnum, timestamp, varchar } from "drizzle-orm/mysql-core";

/*
 * Conventions (MySQL 8.0.16+, InnoDB, utf8mb4)
 * - Column names are camelCase in TypeScript and snake_case in SQL
 *   (`casing: "snake_case"` in the client and drizzle.config.ts).
 * - Money is integer pence (`*Pence`), never floats. GBP only.
 * - Ids are UUIDs as VARCHAR(36), generated in the app (id()).
 * - Timestamps are DATETIME(3) in UTC (ts()); the connection's time zone is
 *   UTC (src/db/client.ts), so NOW() and CURRENT_TIMESTAMP are UTC too.
 * - Columns that are unique or indexed are VARCHAR with a length; TEXT is
 *   for free text only.
 * - Partial unique indexes ("unique where …") are functional unique indexes
 *   on an expression that is NULL for rows the rule doesn't cover (NULLs
 *   never clash).
 * - IMEIs are 15 digits, stored as text so leading zeros survive.
 */

/**
 * Primary key: a UUID generated in the app. VARCHAR rather than CHAR because
 * the Auth.js Drizzle adapter requires VARCHAR or TEXT ids.
 */
export const id = () =>
  varchar({ length: 36 })
    .primaryKey()
    .$defaultFn(() => randomUUID());

/** A UUID foreign key column. */
export const uuidRef = () => varchar({ length: 36 });

/** UTC timestamp with milliseconds. */
export const ts = () => datetime({ mode: "date", fsp: 3 });

/**
 * TIMESTAMP(3), for the few columns the Auth.js MySQL adapter reads and
 * writes itself (emailVerified, session and token expiry): it requires
 * TIMESTAMP rather than DATETIME. Fine for these (range ends in 2038).
 */
export const authTs = () => timestamp({ mode: "date", fsp: 3 });

/** DEFAULT for a ts() column: the current time (UTC, see the client). */
export const NOW = sql`(CURRENT_TIMESTAMP(3))`;

export const timestamps = {
  createdAt: ts().notNull().default(NOW),
  updatedAt: ts()
    .notNull()
    .default(NOW)
    .$onUpdate(() => new Date()),
};

/** MySQL regex for a 15-digit IMEI. */
export const IMEI_PATTERN = "^[0-9]{15}$";

/**
 * An enum type: call it for a column (`grade: productGrade().notNull()`),
 * read `.enumValues` for its values.
 */
export function enumType<const T extends readonly [string, ...string[]]>(values: T) {
  return Object.assign(() => mysqlEnum(values as unknown as [T[number], ...T[number][]]), {
    enumValues: values,
  });
}

// Enums ---------------------------------------------------------------------

/** Cosmetic grade of a refurbished unit we sell. Mirrors src/lib/grades.ts. */
export const productGrade = enumType(["A", "B", "C"]);

/** Condition of a phone we buy. Same A/B/C scale as the shop, plus faulty. */
export const tradeInGrade = enumType(["A", "B", "C", "faulty"]);

/**
 * Staff roles. Permissions per role live in admin/src/auth/roles.ts.
 * owner: everything, including staff management.
 * manager: day-to-day operations, prices, payouts, refunds.
 * staff: trade-ins, inspections, stock and orders.
 * content_editor: site content and reviews only.
 */
export const staffRole = enumType(["owner", "manager", "staff", "content_editor"]);

/**
 * How each unit in a category is identified: a checked 15-digit IMEI, the
 * maker's serial number, or a stock code we generate (e.g. accessories).
 */
export const identifierType = enumType(["imei", "serial", "none"]);

/** How a staff session completed its second factor. */
export const mfaMethod = enumType(["passkey", "totp"]);

export const quoteStatus = enumType([
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

export const deliveryMethod = enumType([
  "freepost", // deprecated: superseded by postage_pack / print_label
  "courier_collection",
  "store_drop_off",
  "postage_pack", // we post the customer a free pack
  "print_label", // customer prints a label and posts it
]);

export const checkmendResult = enumType([
  "clear",
  "lost_or_stolen",
  "blocked",
  "finance_outstanding",
  "insurance_claim",
  "error",
]);

export const revisedOfferStatus = enumType(["not_required", "pending", "accepted", "declined"]);

export const productStatus = enumType([
  "draft",
  "listed",
  "reserved",
  "sold",
  "returned",
  "withdrawn",
]);

export const orderStatus = enumType([
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

export const fulfilmentMethod = enumType(["delivery", "click_and_collect"]);

export const paymentStatus = enumType([
  "requires_payment",
  "processing",
  "succeeded",
  "failed",
  "cancelled",
  "refunded",
  "partially_refunded",
]);

export const payoutMethod = enumType(["bank_transfer", "in_store"]);

export const payoutStatus = enumType(["pending", "processing", "paid", "failed", "cancelled"]);

export const priceAlertType = enumType(["shop", "trade_in"]);

export const reviewStatus = enumType(["pending", "published", "rejected"]);

export const actorType = enumType(["staff", "customer", "system"]);
