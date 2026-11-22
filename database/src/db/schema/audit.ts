import { bigint, index, json, mysqlTable, text, varchar } from "drizzle-orm/mysql-core";

import { actorType, NOW, ts, uuidRef } from "./_shared";

/**
 * Append-only record of who changed what. Write an entry for price changes,
 * quote/inspection decisions, payouts, refunds and staff/role changes.
 * Never store secrets or decrypted bank details in `changes`.
 */
export const auditLog = mysqlTable(
  "audit_log",
  {
    id: bigint({ mode: "number", unsigned: true }).primaryKey().autoincrement(),
    actorType: actorType().notNull(),
    /** staff_users.id or customers.id. Not a foreign key so entries outlive accounts. */
    actorId: uuidRef(),
    /** Dotted verb, e.g. "trade_in_price.update", "payout.mark_paid". */
    action: varchar({ length: 100 }).notNull(),
    entityType: varchar({ length: 64 }).notNull(),
    entityId: varchar({ length: 191 }).notNull(),
    changes: json().$type<{ before?: unknown; after?: unknown }>(),
    ipAddress: varchar({ length: 64 }),
    userAgent: text(),
    createdAt: ts().notNull().default(NOW),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
    index("audit_log_actor_idx").on(t.actorId),
    index("audit_log_created_at_idx").on(t.createdAt),
  ],
);
