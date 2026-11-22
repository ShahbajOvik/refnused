import { sql } from "drizzle-orm";
import { char, index, mysqlTable, text, uniqueIndex } from "drizzle-orm/mysql-core";

import { enumType, id, NOW, timestamps, ts, uuidRef } from "./_shared";
import { customers } from "./people";
import { orders } from "./shop";
import { quotes } from "./trade-in";

/*
 * Web Push (src/lib/push/). A browser subscribes only when the customer asks
 * for updates on something: a quote, an order, or their price alerts.
 */

/** What a device asked to hear about. */
export const pushTopicKind = enumType(["quote", "order", "price_alerts"]);

/**
 * One browser's push subscription. The endpoint is a secret URL at the
 * browser's push service (only known services are accepted, see
 * src/lib/push/subscription.ts); p256dh and auth encrypt the messages.
 * Endpoints can be up to 2048 characters, too long for a MySQL index, so
 * uniqueness is on its SHA-256 (src/lib/push/service.ts endpointHash()).
 */
export const pushSubscriptions = mysqlTable("push_subscriptions", {
  id: id(),
  endpoint: text().notNull(),
  endpointHash: char({ length: 64 }).notNull().unique("push_subscriptions_endpoint_hash_unique"),
  p256dh: text().notNull(),
  auth: text().notNull(),
  lastSentAt: ts(),
  ...timestamps,
});

/**
 * What a subscription gets told about. Exactly one target is set, matching
 * the kind, and quote and order topics carry the path to open (encrypted,
 * context "push_topic.path"). MySQL can't CHECK columns used by cascading
 * foreign keys, so savePushTopic() enforces this.
 */
export const pushTopics = mysqlTable(
  "push_topics",
  {
    id: id(),
    subscriptionId: uuidRef()
      .notNull()
      .references(() => pushSubscriptions.id, { onDelete: "cascade" }),
    kind: pushTopicKind().notNull(),
    quoteId: uuidRef().references(() => quotes.id, { onDelete: "cascade" }),
    orderId: uuidRef().references(() => orders.id, { onDelete: "cascade" }),
    customerId: uuidRef().references(() => customers.id, { onDelete: "cascade" }),
    pathEncrypted: text(),
    createdAt: ts().notNull().default(NOW),
  },
  (t) => [
    uniqueIndex("push_topics_unique").on(
      t.subscriptionId,
      t.kind,
      sql`(coalesce(${t.quoteId}, ${t.orderId}, ${t.customerId}))`,
    ),
    index("push_topics_quote_idx").on(t.quoteId),
    index("push_topics_order_idx").on(t.orderId),
    index("push_topics_customer_idx").on(t.customerId),
  ],
);
