import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  mysqlTable,
  smallint,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

import { enumType, id, NOW, timestamps, ts, uuidRef } from "./_shared";
import { customers } from "./people";

/** Delivery addresses saved in a customer's account. */
export const customerAddresses = mysqlTable(
  "customer_addresses",
  {
    id: id(),
    customerId: uuidRef()
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    /** e.g. "Home", "Work". */
    label: varchar({ length: 50 }),
    name: text().notNull(),
    line1: text().notNull(),
    line2: text(),
    town: varchar({ length: 100 }).notNull(),
    county: varchar({ length: 100 }),
    postcode: varchar({ length: 10 }).notNull(),
    isDefault: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("customer_addresses_customer_idx").on(t.customerId),
    // One default address per customer (NULL for the others, which never clash).
    uniqueIndex("customer_addresses_one_default").on(
      sql`(case when ${t.isDefault} then ${t.customerId} end)`,
    ),
  ],
);

/**
 * The bank account a customer wants trade-ins paid to. Encrypted like
 * payouts (src/lib/crypto/bank-details.ts); only the last 4 digits of the
 * account number and sort code are stored in clear, for display.
 */
export const customerPayoutAccounts = mysqlTable("customer_payout_accounts", {
  customerId: uuidRef()
    .primaryKey()
    .references(() => customers.id, { onDelete: "cascade" }),
  accountHolderNameEncrypted: text().notNull(),
  sortCodeEncrypted: text().notNull(),
  accountNumberEncrypted: text().notNull(),
  accountNumberLast4: varchar({ length: 4 }).notNull(),
  sortCodeLast2: varchar({ length: 2 }).notNull(),
  /** When the customer last confirmed a change with an emailed code. */
  verifiedAt: ts().notNull(),
  ...timestamps,
});

export const verificationPurpose = enumType(["payout_change", "delete_account"]);

/**
 * One-time codes emailed to confirm sensitive account changes. Only a hash
 * is stored; codes expire quickly and allow a few attempts.
 */
export const customerVerificationCodes = mysqlTable(
  "customer_verification_codes",
  {
    id: id(),
    customerId: uuidRef()
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    purpose: verificationPurpose().notNull(),
    codeHash: varchar({ length: 128 }).notNull(),
    expiresAt: ts().notNull(),
    attempts: smallint().notNull().default(0),
    consumedAt: ts(),
    createdAt: ts().notNull().default(NOW),
  },
  (t) => [
    index("customer_verification_codes_lookup_idx").on(t.customerId, t.purpose),
    check("customer_verification_codes_attempts_check", sql`${t.attempts} between 0 and 10`),
  ],
);
