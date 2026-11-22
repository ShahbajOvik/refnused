import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { mfaMethod } from "./_shared";
import { customers, staffUsers } from "./people";

/*
 * Auth.js tables. Customers and staff each get their own set, used by two
 * separate Auth.js instances (src/auth/customer.ts and src/auth/staff.ts),
 * so a customer session can never be mistaken for a staff session.
 *
 * Property names (userId, refresh_token, credentialID …) are the ones the
 * @auth/drizzle-adapter expects. Do not rename them.
 */

// Customers -------------------------------------------------------------------

export const customerAccounts = pgTable(
  "customer_accounts",
  {
    userId: uuid()
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    type: text().notNull(),
    provider: text().notNull(),
    providerAccountId: text().notNull(),
    refresh_token: text(),
    access_token: text(),
    expires_at: integer(),
    token_type: text(),
    scope: text(),
    id_token: text(),
    session_state: text(),
  },
  (t) => [
    primaryKey({ name: "customer_accounts_pk", columns: [t.provider, t.providerAccountId] }),
    index("customer_accounts_user_idx").on(t.userId),
  ],
);

export const customerSessions = pgTable(
  "customer_sessions",
  {
    sessionToken: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    expires: timestamp({ withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [index("customer_sessions_user_idx").on(t.userId)],
);

export const customerVerificationTokens = pgTable(
  "customer_verification_tokens",
  {
    identifier: text().notNull(),
    token: text().notNull(),
    expires: timestamp({ withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [
    primaryKey({ name: "customer_verification_tokens_pk", columns: [t.identifier, t.token] }),
  ],
);

/** Customer passkeys, managed by the Auth.js Passkey provider. */
export const customerAuthenticators = pgTable(
  "customer_authenticators",
  {
    credentialID: text().notNull().unique("customer_authenticators_credential_id_unique"),
    userId: uuid()
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    providerAccountId: text().notNull(),
    credentialPublicKey: text().notNull(),
    counter: integer().notNull(),
    credentialDeviceType: text().notNull(),
    credentialBackedUp: boolean().notNull(),
    transports: text(),
  },
  (t) => [primaryKey({ name: "customer_authenticators_pk", columns: [t.userId, t.credentialID] })],
);

// Staff -----------------------------------------------------------------------

export const staffAccounts = pgTable(
  "staff_accounts",
  {
    userId: uuid()
      .notNull()
      .references(() => staffUsers.id, { onDelete: "cascade" }),
    type: text().notNull(),
    provider: text().notNull(),
    providerAccountId: text().notNull(),
    refresh_token: text(),
    access_token: text(),
    expires_at: integer(),
    token_type: text(),
    scope: text(),
    id_token: text(),
    session_state: text(),
  },
  (t) => [
    primaryKey({ name: "staff_accounts_pk", columns: [t.provider, t.providerAccountId] }),
    index("staff_accounts_user_idx").on(t.userId),
  ],
);

/**
 * Staff sessions. Auth.js creates the row after the first factor (magic
 * link or Google). Our own columns track the second factor and activity;
 * src/auth/staff-session.ts decides whether a session may reach /admin.
 */
export const staffSessions = pgTable(
  "staff_sessions",
  {
    sessionToken: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => staffUsers.id, { onDelete: "cascade" }),
    /** Absolute expiry, set by Auth.js. */
    expires: timestamp({ withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Drives the 30-minute idle timeout. */
    lastActiveAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Null until the second factor (passkey or TOTP) succeeds. */
    mfaVerifiedAt: timestamp({ withTimezone: true }),
    mfaMethod: mfaMethod(),
    mfaFailedAttempts: smallint().notNull().default(0),
    /** Pending WebAuthn challenge for this session, single use. */
    webauthnChallenge: text(),
    webauthnChallengeExpiresAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("staff_sessions_user_idx").on(t.userId)],
);

export const staffVerificationTokens = pgTable(
  "staff_verification_tokens",
  {
    identifier: text().notNull(),
    token: text().notNull(),
    expires: timestamp({ withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ name: "staff_verification_tokens_pk", columns: [t.identifier, t.token] })],
);

/** Staff passkeys, used as the second factor (src/auth/staff-passkeys.ts). */
export const staffPasskeys = pgTable(
  "staff_passkeys",
  {
    id: uuid().primaryKey().defaultRandom(),
    staffId: uuid()
      .notNull()
      .references(() => staffUsers.id, { onDelete: "cascade" }),
    /** base64url credential ID. */
    credentialId: text().notNull().unique("staff_passkeys_credential_id_unique"),
    /** base64url COSE public key. */
    publicKey: text().notNull(),
    counter: integer().notNull().default(0),
    transports: jsonb().$type<string[]>(),
    deviceType: text().notNull(),
    backedUp: boolean().notNull(),
    /** Staff-chosen label, e.g. "Work laptop". */
    name: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("staff_passkeys_staff_idx").on(t.staffId)],
);
