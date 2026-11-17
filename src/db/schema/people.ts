import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
    marketingOptIn: boolean().notNull().default(false),
    /** Set when a customer is erased under UK GDPR; personal fields are cleared. */
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("customers_email_lower_idx").on(sql`lower(${t.email})`)],
);

export const staffUsers = pgTable(
  "staff_users",
  {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull(),
    name: text().notNull(),
    role: staffRole().notNull(),
    /** Home store. Null for head-office staff. */
    storeId: uuid().references(() => stores.id, { onDelete: "set null" }),
    /** Null when the account signs in only through SSO / magic link. */
    passwordHash: text(),
    isActive: boolean().notNull().default(true),
    lastLoginAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("staff_users_email_lower_idx").on(sql`lower(${t.email})`),
    index("staff_users_store_idx").on(t.storeId),
  ],
);
