import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { timestamps } from "./_shared";
import { customers } from "./people";

/** Delivery addresses saved in a customer's account. */
export const customerAddresses = pgTable(
  "customer_addresses",
  {
    id: uuid().primaryKey().defaultRandom(),
    customerId: uuid()
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    /** e.g. "Home", "Work". */
    label: text(),
    name: text().notNull(),
    line1: text().notNull(),
    line2: text(),
    town: text().notNull(),
    county: text(),
    postcode: text().notNull(),
    isDefault: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("customer_addresses_customer_idx").on(t.customerId),
    uniqueIndex("customer_addresses_one_default")
      .on(t.customerId)
      .where(sql`${t.isDefault}`),
  ],
);

/**
 * The bank account a customer wants trade-ins paid to. Encrypted like
 * payouts (src/lib/crypto/bank-details.ts); only the last 4 digits of the
 * account number and sort code are stored in clear, for display.
 */
export const customerPayoutAccounts = pgTable("customer_payout_accounts", {
  customerId: uuid()
    .primaryKey()
    .references(() => customers.id, { onDelete: "cascade" }),
  accountHolderNameEncrypted: text().notNull(),
  sortCodeEncrypted: text().notNull(),
  accountNumberEncrypted: text().notNull(),
  accountNumberLast4: varchar({ length: 4 }).notNull(),
  sortCodeLast2: varchar({ length: 2 }).notNull(),
  /** When the customer last confirmed a change with an emailed code. */
  verifiedAt: timestamp({ withTimezone: true }).notNull(),
  ...timestamps,
});

export const verificationPurpose = pgEnum("verification_purpose", [
  "payout_change",
  "delete_account",
]);

/**
 * One-time codes emailed to confirm sensitive account changes. Only a hash
 * is stored; codes expire quickly and allow a few attempts.
 */
export const customerVerificationCodes = pgTable(
  "customer_verification_codes",
  {
    id: uuid().primaryKey().defaultRandom(),
    customerId: uuid()
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    purpose: verificationPurpose().notNull(),
    codeHash: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    attempts: smallint().notNull().default(0),
    consumedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("customer_verification_codes_lookup_idx").on(t.customerId, t.purpose),
    check("customer_verification_codes_attempts_check", sql`${t.attempts} between 0 and 10`),
  ],
);
