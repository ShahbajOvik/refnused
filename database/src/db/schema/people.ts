import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { staffRole, timestamps } from "./_shared";
import { stores } from "./stores";

/**
 * Customers (sellers and buyers). Columns name/email/emailVerified/image
 * match what the Auth.js Drizzle adapter expects for its user table.
 */
export const customers = pgTable(
  "customers",
  {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull(),
    name: text(),
    phone: text(),
    emailVerified: timestamp({ withTimezone: true }),
    image: text(),
    /** Marketing emails (opt-in, UK GDPR/PECR). Changes are recorded in audit_log. */
    marketingOptIn: boolean().notNull().default(false),
    /** Marketing texts (opt-in). */
    marketingSmsOptIn: boolean().notNull().default(false),
    marketingUpdatedAt: timestamp({ withTimezone: true }),
    /** Set when a customer is erased under UK GDPR; personal fields are cleared. */
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("customers_email_lower_idx").on(sql`lower(${t.email})`)],
);

/**
 * Staff accounts. Pre-provisioned only (`npm run staff:create`): sign-in
 * never creates a staff user. Columns name/email/emailVerified/image are
 * what the staff Auth.js instance's adapter needs.
 */
export const staffUsers = pgTable(
  "staff_users",
  {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull(),
    name: text().notNull(),
    emailVerified: timestamp({ withTimezone: true }),
    image: text(),
    role: staffRole().notNull(),
    /** scrypt hash (src/auth/password.ts). Null until the person sets a password. */
    passwordHash: text(),
    passwordChangedAt: timestamp({ withTimezone: true }),
    /** Home store. Null for head-office staff. */
    storeId: uuid().references(() => stores.id, { onDelete: "set null" }),
    /**
     * TOTP secret, encrypted with src/lib/crypto/field-encryption.ts
     * (context "staff_users.totp_secret"). Set during setup; only trusted
     * once totpEnabledAt is set.
     */
    totpSecretEncrypted: text(),
    totpEnabledAt: timestamp({ withTimezone: true }),
    /** Last accepted TOTP time step, to block code replay. */
    totpLastUsedStep: integer(),
    isActive: boolean().notNull().default(true),
    lastLoginAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("staff_users_email_lower_idx").on(sql`lower(${t.email})`),
    index("staff_users_store_idx").on(t.storeId),
  ],
);
