import {
  boolean,
  index,
  int,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

import { authTs, id, staffRole, timestamps, ts, uuidRef } from "./_shared";
import { stores } from "./stores";

/**
 * Customers (sellers and buyers). Columns name/email/emailVerified/image
 * match what the Auth.js Drizzle adapter expects for its user table.
 */
export const customers = mysqlTable(
  "customers",
  {
    id: id(),
    email: varchar({ length: 254 }).notNull(),
    name: text(),
    phone: varchar({ length: 32 }),
    emailVerified: authTs(),
    image: text(),
    /** Marketing emails (opt-in, UK GDPR/PECR). Changes are recorded in audit_log. */
    marketingOptIn: boolean().notNull().default(false),
    /** Marketing texts (opt-in). */
    marketingSmsOptIn: boolean().notNull().default(false),
    marketingUpdatedAt: ts(),
    /** Set when a customer is erased under UK GDPR; personal fields are cleared. */
    deletedAt: ts(),
    ...timestamps,
  },
  // The column's collation is case-insensitive, so this is unique regardless of case.
  (t) => [uniqueIndex("customers_email_idx").on(t.email)],
);

/**
 * Staff accounts. Pre-provisioned only (`npm run staff:create`): sign-in
 * never creates a staff user. Columns name/email/emailVerified/image are
 * what the staff Auth.js instance's adapter needs.
 */
export const staffUsers = mysqlTable(
  "staff_users",
  {
    id: id(),
    email: varchar({ length: 254 }).notNull(),
    name: text().notNull(),
    emailVerified: authTs(),
    image: text(),
    role: staffRole().notNull(),
    /** scrypt hash (src/lib/auth/password.ts). Null until the person sets a password. */
    passwordHash: text(),
    passwordChangedAt: ts(),
    /** Home store. Null for head-office staff. */
    storeId: uuidRef().references(() => stores.id, { onDelete: "set null" }),
    /**
     * TOTP secret, encrypted with src/lib/crypto/field-encryption.ts
     * (context "staff_users.totp_secret"). Set during setup; only trusted
     * once totpEnabledAt is set.
     */
    totpSecretEncrypted: text(),
    totpEnabledAt: ts(),
    /** Last accepted TOTP time step, to block code replay. */
    totpLastUsedStep: int(),
    isActive: boolean().notNull().default(true),
    lastLoginAt: ts(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("staff_users_email_idx").on(t.email),
    index("staff_users_store_idx").on(t.storeId),
  ],
);
