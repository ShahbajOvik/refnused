import { bigint, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { actorType } from "./_shared";

/**
 * Append-only record of who changed what. Write an entry for price changes,
 * quote/inspection decisions, payouts, refunds and staff/role changes.
 * Never store secrets or decrypted bank details in `changes`.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    actorType: actorType().notNull(),
    /** staff_users.id or customers.id. Not a foreign key so entries outlive accounts. */
    actorId: uuid(),
    /** Dotted verb, e.g. "trade_in_price.update", "payout.mark_paid". */
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: text().notNull(),
    changes: jsonb().$type<{ before?: unknown; after?: unknown }>(),
    ipAddress: text(),
    userAgent: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
    index("audit_log_actor_idx").on(t.actorId),
    index("audit_log_created_at_idx").on(t.createdAt),
  ],
);
