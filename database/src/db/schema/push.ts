import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { timestamps } from "./_shared";
import { customers } from "./people";
import { orders } from "./shop";
import { quotes } from "./trade-in";

/*
 * Web Push (src/lib/push/). A browser subscribes only when the customer asks
 * for updates on something: a quote, an order, or their price alerts.
 */

/** What a device asked to hear about. */
export const pushTopicKind = pgEnum("push_topic_kind", ["quote", "order", "price_alerts"]);

/**
 * One browser's push subscription. The endpoint is a secret URL at the
 * browser's push service (only known services are accepted, see
 * src/lib/push/subscription.ts); p256dh and auth encrypt the messages.
 */
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid().primaryKey().defaultRandom(),
  endpoint: text().notNull().unique("push_subscriptions_endpoint_unique"),
  p256dh: text().notNull(),
  auth: text().notNull(),
  lastSentAt: timestamp({ withTimezone: true }),
  ...timestamps,
});

/**
 * What a subscription gets told about. Exactly one target is set, matching
 * the kind. Quote and order links are secret, so the path to open from the
 * notification is stored encrypted (context "push_topic.path").
 */
export const pushTopics = pgTable(
  "push_topics",
  {
    id: uuid().primaryKey().defaultRandom(),
    subscriptionId: uuid()
      .notNull()
      .references(() => pushSubscriptions.id, { onDelete: "cascade" }),
    kind: pushTopicKind().notNull(),
    quoteId: uuid().references(() => quotes.id, { onDelete: "cascade" }),
    orderId: uuid().references(() => orders.id, { onDelete: "cascade" }),
    customerId: uuid().references(() => customers.id, { onDelete: "cascade" }),
    pathEncrypted: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("push_topics_unique").on(
      t.subscriptionId,
      t.kind,
      sql`coalesce(${t.quoteId}, ${t.orderId}, ${t.customerId})`,
    ),
    index("push_topics_quote_idx")
      .on(t.quoteId)
      .where(sql`${t.quoteId} is not null`),
    index("push_topics_order_idx")
      .on(t.orderId)
      .where(sql`${t.orderId} is not null`),
    index("push_topics_customer_idx")
      .on(t.customerId)
      .where(sql`${t.customerId} is not null`),
    check(
      "push_topics_target_check",
      sql`(${t.kind} = 'quote' and ${t.quoteId} is not null and ${t.orderId} is null and ${t.customerId} is null and ${t.pathEncrypted} is not null)
        or (${t.kind} = 'order' and ${t.orderId} is not null and ${t.quoteId} is null and ${t.customerId} is null and ${t.pathEncrypted} is not null)
        or (${t.kind} = 'price_alerts' and ${t.customerId} is not null and ${t.quoteId} is null and ${t.orderId} is null)`,
    ),
  ],
);
