import { sql } from "drizzle-orm";
import { check, index, int, json, mysqlTable, text, varchar } from "drizzle-orm/mysql-core";

import { modelVariants } from "./catalogue";
import {
  checkmendResult,
  deliveryMethod,
  id,
  IMEI_PATTERN,
  NOW,
  payoutMethod,
  payoutStatus,
  quoteStatus,
  revisedOfferStatus,
  timestamps,
  tradeInGrade,
  ts,
  uuidRef,
} from "./_shared";
import { customers, staffUsers } from "./people";
import { stores } from "./stores";

/** The customer's answers to the condition questions, as shown when quoted. */
/** Contact address for a trade-in (postage pack delivery and returns). */
export type QuoteAddress = {
  line1: string;
  line2?: string;
  town: string;
  postcode: string;
};

/** Snapshot of how the offer was calculated, kept with the quote. */
export type OfferBreakdown = {
  grade: "A" | "B" | "C" | "faulty";
  basePricePence: number;
  deductions: { questionKey: string; optionKey: string; label: string; amountPence: number }[];
  offerPence: number;
};

export type QuoteAnswers = {
  /** Bump when the question set changes so old answers stay readable. */
  version: number;
  responses: Record<string, string | number | boolean>;
};

export const quotes = mysqlTable(
  "quotes",
  {
    id: id(),
    /** Customer-facing reference, e.g. RU-Q-7K3M9P. */
    reference: varchar({ length: 32 }).notNull().unique(),
    /** Null while the instant quote is anonymous; set when the customer accepts. */
    customerId: uuidRef().references(() => customers.id, { onDelete: "restrict" }),
    variantId: uuidRef()
      .notNull()
      .references(() => modelVariants.id, { onDelete: "restrict" }),
    /** Grade derived from the answers, which set the offered price. */
    quotedGrade: tradeInGrade().notNull(),
    answers: json().$type<QuoteAnswers>().notNull(),
    /** Calculated on the server from trade_in_prices. Never from client input. */
    offeredPricePence: int().notNull(),
    status: quoteStatus().notNull().default("offered"),
    /** We honour offeredPricePence for devices received before this time. */
    priceLockedUntil: ts().notNull(),
    imei: varchar({ length: 15 }),
    deliveryMethod: deliveryMethod(),
    dropOffStoreId: uuidRef().references(() => stores.id, { onDelete: "restrict" }),
    acceptedAt: ts(),
    receivedAt: ts(),
    /** Contact details given when accepting (kept even if the account changes). */
    contactName: text(),
    contactEmail: varchar({ length: 254 }),
    /** E.164, e.g. +447700900123. */
    contactPhone: varchar({ length: 32 }),
    contactAddress: json().$type<QuoteAddress>(),
    offerBreakdown: json().$type<OfferBreakdown>(),
    /** SHA-256 of the secret tracking token emailed to the customer. */
    trackingTokenHash: varchar({ length: 128 }).unique("quotes_tracking_token_hash_unique"),
    /** Customer declared they own the phone and can sell it. */
    ownershipDeclaredAt: ts(),
    /** Customer declared Find My iPhone / Google account lock is off. */
    activationLockOffDeclaredAt: ts(),
    ...timestamps,
  },
  (t) => [
    index("quotes_customer_idx").on(t.customerId),
    index("quotes_status_idx").on(t.status),
    index("quotes_imei_idx").on(t.imei),
    check("quotes_offered_price_check", sql`${t.offeredPricePence} >= 0`),
    check(
      "quotes_imei_check",
      sql`${t.imei} is null or regexp_like(${t.imei}, '${sql.raw(IMEI_PATTERN)}')`,
    ),
    check(
      "quotes_drop_off_store_check",
      sql`not (${t.deliveryMethod} <=> 'store_drop_off') or ${t.dropOffStoreId} is not null`,
    ),
    check(
      "quotes_declarations_check",
      sql`${t.status} in ('offered', 'expired', 'cancelled') or (${t.ownershipDeclaredAt} is not null and ${t.activationLockOffDeclaredAt} is not null and ${t.contactEmail} is not null)`,
    ),
    check(
      "quotes_accepted_check",
      sql`${t.status} in ('offered', 'expired', 'cancelled') or (${t.customerId} is not null and ${t.deliveryMethod} is not null)`,
    ),
  ],
);

export const inspections = mysqlTable(
  "inspections",
  {
    id: id(),
    quoteId: uuidRef()
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    staffId: uuidRef()
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    actualGrade: tradeInGrade().notNull(),
    /** Null when the original offer stands. */
    revisedPricePence: int(),
    revisedOfferStatus: revisedOfferStatus().notNull().default("not_required"),
    /** Null until the CheckMEND check has run. */
    checkmendResult: checkmendResult(),
    checkmendReference: varchar({ length: 100 }),
    notes: text(),
    /** Inspection photos (media object keys), e.g. damage the customer didn't declare. */
    photos: json()
      .$type<{ key: string; alt: string }[]>()
      .notNull()
      .default(sql`(JSON_ARRAY())`),
    inspectedAt: ts().notNull().default(NOW),
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
export const payouts = mysqlTable(
  "payouts",
  {
    id: id(),
    quoteId: uuidRef()
      .notNull()
      .unique("payouts_quote_id_unique")
      .references(() => quotes.id, { onDelete: "restrict" }),
    customerId: uuidRef()
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    amountPence: int().notNull(),
    method: payoutMethod().notNull(),
    status: payoutStatus().notNull().default("pending"),
    accountHolderNameEncrypted: text(),
    sortCodeEncrypted: text(),
    accountNumberEncrypted: text(),
    /** Plain last 4 digits, for display ("ending 1234"). */
    accountNumberLast4: varchar({ length: 4 }),
    /** Payment reference shown on the customer's statement. */
    reference: varchar({ length: 64 }),
    paidAt: ts(),
    /** Included in a bank payment file (status moves to processing). */
    exportedAt: ts(),
    exportBatchId: varchar({ length: 64 }),
    processedBy: uuidRef().references(() => staffUsers.id, { onDelete: "set null" }),
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
