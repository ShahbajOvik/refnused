import {
  boolean,
  index,
  int,
  json,
  mysqlTable,
  primaryKey,
  smallint,
  text,
  varchar,
} from "drizzle-orm/mysql-core";

import { authTs, id, mfaMethod, NOW, ts, uuidRef } from "./_shared";
import { customers, staffUsers } from "./people";

/*
 * Auth.js tables. Customers and staff each get their own set, used by two
 * separate Auth.js instances (refnused/src/auth/customer.ts and
 * admin/src/auth/staff.ts), so a customer session can never be mistaken for
 * a staff session.
 *
 * Property names (userId, refresh_token, credentialID …) are the ones the
 * @auth/drizzle-adapter expects. Do not rename them. Keys and tokens are
 * VARCHAR(255), as in Auth.js's own MySQL schema.
 */

// Customers -------------------------------------------------------------------

export const customerAccounts = mysqlTable(
  "customer_accounts",
  {
    userId: uuidRef()
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    type: varchar({ length: 255 }).notNull(),
    provider: varchar({ length: 255 }).notNull(),
    providerAccountId: varchar({ length: 255 }).notNull(),
    refresh_token: text(),
    access_token: text(),
    expires_at: int(),
    token_type: varchar({ length: 255 }),
    scope: varchar({ length: 255 }),
    id_token: text(),
    session_state: varchar({ length: 255 }),
  },
  (t) => [
    primaryKey({ name: "customer_accounts_pk", columns: [t.provider, t.providerAccountId] }),
    index("customer_accounts_user_idx").on(t.userId),
  ],
);

export const customerSessions = mysqlTable(
  "customer_sessions",
  {
    sessionToken: varchar({ length: 255 }).primaryKey(),
    userId: uuidRef()
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    expires: authTs().notNull(),
  },
  (t) => [index("customer_sessions_user_idx").on(t.userId)],
);

export const customerVerificationTokens = mysqlTable(
  "customer_verification_tokens",
  {
    identifier: varchar({ length: 255 }).notNull(),
    token: varchar({ length: 255 }).notNull(),
    expires: authTs().notNull(),
  },
  (t) => [
    primaryKey({ name: "customer_verification_tokens_pk", columns: [t.identifier, t.token] }),
  ],
);

/** Customer passkeys, managed by the Auth.js Passkey provider. */
export const customerAuthenticators = mysqlTable(
  "customer_authenticators",
  {
    credentialID: varchar({ length: 255 })
      .notNull()
      .unique("customer_authenticators_credential_id_unique"),
    userId: uuidRef()
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    providerAccountId: varchar({ length: 255 }).notNull(),
    credentialPublicKey: text().notNull(),
    counter: int().notNull(),
    credentialDeviceType: varchar({ length: 255 }).notNull(),
    credentialBackedUp: boolean().notNull(),
    transports: varchar({ length: 255 }),
  },
  (t) => [primaryKey({ name: "customer_authenticators_pk", columns: [t.userId, t.credentialID] })],
);

// Staff -----------------------------------------------------------------------

export const staffAccounts = mysqlTable(
  "staff_accounts",
  {
    userId: uuidRef()
      .notNull()
      .references(() => staffUsers.id, { onDelete: "cascade" }),
    type: varchar({ length: 255 }).notNull(),
    provider: varchar({ length: 255 }).notNull(),
    providerAccountId: varchar({ length: 255 }).notNull(),
    refresh_token: text(),
    access_token: text(),
    expires_at: int(),
    token_type: varchar({ length: 255 }),
    scope: varchar({ length: 255 }),
    id_token: text(),
    session_state: varchar({ length: 255 }),
  },
  (t) => [
    primaryKey({ name: "staff_accounts_pk", columns: [t.provider, t.providerAccountId] }),
    index("staff_accounts_user_idx").on(t.userId),
  ],
);

/**
 * Staff sessions. Auth.js creates the row after the first factor (magic
 * link or Google). Our own columns track the second factor and activity;
 * admin/src/auth/staff-session.ts decides whether a session may reach /admin.
 */
export const staffSessions = mysqlTable(
  "staff_sessions",
  {
    sessionToken: varchar({ length: 255 }).primaryKey(),
    userId: uuidRef()
      .notNull()
      .references(() => staffUsers.id, { onDelete: "cascade" }),
    /** Absolute expiry, set by Auth.js. */
    expires: authTs().notNull(),
    createdAt: ts().notNull().default(NOW),
    /** Drives the 30-minute idle timeout. */
    lastActiveAt: ts().notNull().default(NOW),
    /** Null until the second factor (passkey or TOTP) succeeds. */
    mfaVerifiedAt: ts(),
    mfaMethod: mfaMethod(),
    mfaFailedAttempts: smallint().notNull().default(0),
    /** Pending WebAuthn challenge for this session, single use. */
    webauthnChallenge: varchar({ length: 255 }),
    webauthnChallengeExpiresAt: ts(),
  },
  (t) => [index("staff_sessions_user_idx").on(t.userId)],
);

export const staffVerificationTokens = mysqlTable(
  "staff_verification_tokens",
  {
    identifier: varchar({ length: 255 }).notNull(),
    token: varchar({ length: 255 }).notNull(),
    expires: authTs().notNull(),
  },
  (t) => [primaryKey({ name: "staff_verification_tokens_pk", columns: [t.identifier, t.token] })],
);

/** Staff passkeys, used as the second factor (admin/src/auth/staff-passkeys.ts). */
export const staffPasskeys = mysqlTable(
  "staff_passkeys",
  {
    id: id(),
    staffId: uuidRef()
      .notNull()
      .references(() => staffUsers.id, { onDelete: "cascade" }),
    /** base64url credential ID. */
    credentialId: varchar({ length: 255 }).notNull().unique("staff_passkeys_credential_id_unique"),
    /** base64url COSE public key. */
    publicKey: text().notNull(),
    counter: int().notNull().default(0),
    transports: json().$type<string[]>(),
    deviceType: varchar({ length: 32 }).notNull(),
    backedUp: boolean().notNull(),
    /** Staff-chosen label, e.g. "Work laptop". */
    name: varchar({ length: 100 }).notNull(),
    createdAt: ts().notNull().default(NOW),
    lastUsedAt: ts(),
  },
  (t) => [index("staff_passkeys_staff_idx").on(t.staffId)],
);
