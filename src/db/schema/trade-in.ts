import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { modelVariants } from "./catalogue";
import {
  checkmendResult,
  deliveryMethod,
  IMEI_PATTERN,
  payoutMethod,
  payoutStatus,
  quoteStatus,
  revisedOfferStatus,
  timestamps,
  tradeInGrade,
} from "./_shared";
import { customers, staffUsers } from "./people";
import { stores } from "./stores";

/** The customer's answers to the condition questions, as shown when quoted. */
export type QuoteAnswers = {
  /** Bump when the question set changes so old answers stay readable. */
  version: number;
  responses: Record<string, string | number | boolean>;
};

export const quotes = pgTable(
  "quotes",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Customer-facing reference, e.g. RU-Q-7K3M9P. */
    reference: text().notNull().unique(),
    /** Null while the instant quote is anonymous; set when the customer accepts. */
    customerId: uuid().references(() => customers.id, { onDelete: "restrict" }),
    variantId: uuid()
      .notNull()
      .references(() => modelVariants.id, { onDelete: "restrict" }),
    /** Grade derived from the answers, which set the offered price. */
    quotedGrade: tradeInGrade().notNull(),
    answers: jsonb().$type<QuoteAnswers>().notNull(),
    /** Calculated on the server from trade_in_prices. Never from client input. */
    offeredPricePence: integer().notNull(),
    status: quoteStatus().notNull().default("offered"),
    /** We honour offeredPricePence for devices received before this time. */
    priceLockedUntil: timestamp({ withTimezone: true }).notNull(),
    imei: varchar({ length: 15 }),
    deliveryMethod: deliveryMethod(),
    dropOffStoreId: uuid().references(() => stores.id, { onDelete: "restrict" }),
    acceptedAt: timestamp({ withTimezone: true }),
    receivedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("quotes_customer_idx").on(t.customerId),
    index("quotes_status_idx").on(t.status),
    index("quotes_imei_idx").on(t.imei),
    check("quotes_offered_price_check", sql`${t.offeredPricePence} >= 0`),
    check("quotes_imei_check", sql`${t.imei} is null or ${t.imei} ~ '${sql.raw(IMEI_PATTERN)}'`),
    check(
      "quotes_drop_off_store_check",
      sql`${t.deliveryMethod} is distinct from 'store_drop_off' or ${t.dropOffStoreId} is not null`,
    ),
    check(
      "quotes_accepted_check",
      sql`${t.status} in ('offered', 'expired', 'cancelled') or (${t.customerId} is not null and ${t.deliveryMethod} is not null)`,
    ),
  ],
);

export const inspections = pgTable(
  "inspections",
  {
    id: uuid().primaryKey().defaultRandom(),
    quoteId: uuid()
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    staffId: uuid()
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    actualGrade: tradeInGrade().notNull(),
    /** Null when the original offer stands. */
    revisedPricePence: integer(),
    revisedOfferStatus: revisedOfferStatus().notNull().default("not_required"),
    /** Null until the CheckMEND check has run. */
    checkmendResult: checkmendResult(),
    checkmendReference: text(),
    notes: text(),
    inspectedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    index("inspections_quote_idx").on(t.quoteId),
    check(
      "inspections_revised_price_check",
      sql`${t.revisedPricePence} is null or ${t.revisedPricePence} >= 0`,
    ),
    check(
      "inspections_revised_offer_check",
      sql`(${t.revisedPricePence} is null) = (${t.revisedOfferStatus} = 'not_required')`,
    ),
  ],
);

/**
 * Money we pay a customer for a trade-in.
 * Bank fields hold AES-256-GCM ciphertext from src/lib/crypto/bank-details.ts.
 * Never select them into logs, analytics or audit_log.
 */
export const payouts = pgTable(
  "payouts",
  {
    id: uuid().primaryKey().defaultRandom(),
    quoteId: uuid()
      .notNull()
      .unique("payouts_quote_id_unique")
      .references(() => quotes.id, { onDelete: "restrict" }),
    customerId: uuid()
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    amountPence: integer().notNull(),
    method: payoutMethod().notNull(),
    status: payoutStatus().notNull().default("pending"),
    accountHolderNameEncrypted: text(),
    sortCodeEncrypted: text(),
    accountNumberEncrypted: text(),
    /** Plain last 4 digits, for display ("ending 1234"). */
    accountNumberLast4: varchar({ length: 4 }),
    /** Payment reference shown on the customer's statement. */
    reference: text(),
    paidAt: timestamp({ withTimezone: true }),
    processedBy: uuid().references(() => staffUsers.id, { onDelete: "set null" }),
    failureReason: text(),
    ...timestamps,
  },
  (t) => [
    index("payouts_customer_idx").on(t.customerId),
    index("payouts_status_idx").on(t.status),
    check("payouts_amount_check", sql`${t.amountPence} > 0`),
    check(
      "payouts_bank_details_check",
      sql`${t.method} <> 'bank_transfer' or (${t.accountHolderNameEncrypted} is not null and ${t.sortCodeEncrypted} is not null and ${t.accountNumberEncrypted} is not null and ${t.accountNumberLast4} is not null)`,
    ),
  ],
);
