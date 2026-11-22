import { and, count, eq, inArray, notExists, sql } from "drizzle-orm";

import { pushSubscriptions, pushTopics } from "../../db/schema";
import type { AppDb } from "../../db/types";

import type { PushSubscriptionInput } from "./subscription";

/*
 * Push subscriptions and what each one asked to hear about. Pure database
 * code (takes `db`), so it is tested against a real Postgres.
 */

export type PushTarget =
  | { kind: "quote"; quoteId: string }
  | { kind: "order"; orderId: string }
  | { kind: "price_alerts"; customerId: string };

/** A browser can follow this many quotes, orders and alert lists at once. */
export const MAX_TOPICS_PER_SUBSCRIPTION = 30;

/** Path encryption context for the field cipher. */
export const PUSH_PATH_CONTEXT = "push_topic.path";

function targetColumns(target: PushTarget) {
  return {
    kind: target.kind,
    quoteId: target.kind === "quote" ? target.quoteId : null,
    orderId: target.kind === "order" ? target.orderId : null,
    customerId: target.kind === "price_alerts" ? target.customerId : null,
  };
}

function targetWhere(target: PushTarget) {
  switch (target.kind) {
    case "quote":
      return and(eq(pushTopics.kind, "quote"), eq(pushTopics.quoteId, target.quoteId));
    case "order":
      return and(eq(pushTopics.kind, "order"), eq(pushTopics.orderId, target.orderId));
    case "price_alerts":
      return and(eq(pushTopics.kind, "price_alerts"), eq(pushTopics.customerId, target.customerId));
  }
}

export type SavePushTopicResult = { ok: true } | { ok: false; reason: "limit" };

/** Stores (or refreshes) the subscription and adds the topic. Idempotent. */
export async function savePushTopic(
  db: AppDb,
  input: {
    subscription: PushSubscriptionInput;
    target: PushTarget;
    /** Encrypted path to open; required for quotes and orders. */
    pathEncrypted: string | null;
  },
): Promise<SavePushTopicResult> {
  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as AppDb;
    const { endpoint, keys } = input.subscription;
    const [sub] = await tx
      .insert(pushSubscriptions)
      .values({ endpoint, p256dh: keys.p256dh, auth: keys.auth })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { p256dh: keys.p256dh, auth: keys.auth, updatedAt: new Date() },
      })
      .returning({ id: pushSubscriptions.id });
    const subscriptionId = sub!.id;

    const [existing] = await tx
      .select({ id: pushTopics.id })
      .from(pushTopics)
      .where(and(eq(pushTopics.subscriptionId, subscriptionId), targetWhere(input.target)));
    if (existing) {
      if (input.pathEncrypted) {
        await tx
          .update(pushTopics)
          .set({ pathEncrypted: input.pathEncrypted })
          .where(eq(pushTopics.id, existing.id));
      }
      return { ok: true };
    }

    const [{ value } = { value: 0 }] = await tx
      .select({ value: count() })
      .from(pushTopics)
      .where(eq(pushTopics.subscriptionId, subscriptionId));
    if (value >= MAX_TOPICS_PER_SUBSCRIPTION) return { ok: false, reason: "limit" };

    await tx.insert(pushTopics).values({
      subscriptionId,
      ...targetColumns(input.target),
      pathEncrypted: input.pathEncrypted,
    });
    return { ok: true };
  });
}

/** Whether this browser gets updates for the target. */
export async function hasPushTopic(
  db: AppDb,
  input: { endpoint: string; target: PushTarget },
): Promise<boolean> {
  const [row] = await db
    .select({ id: pushTopics.id })
    .from(pushTopics)
    .innerJoin(pushSubscriptions, eq(pushTopics.subscriptionId, pushSubscriptions.id))
    .where(and(eq(pushSubscriptions.endpoint, input.endpoint), targetWhere(input.target)));
  return Boolean(row);
}

/**
 * Stops updates for the target on this browser. When nothing is left, the
 * subscription itself is deleted. Returns how many topics remain.
 */
export async function removePushTopic(
  db: AppDb,
  input: { endpoint: string; target: PushTarget },
): Promise<{ remaining: number }> {
  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as AppDb;
    const [sub] = await tx
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, input.endpoint));
    if (!sub) return { remaining: 0 };
    await tx
      .delete(pushTopics)
      .where(and(eq(pushTopics.subscriptionId, sub.id), targetWhere(input.target)));
    const [{ value } = { value: 0 }] = await tx
      .select({ value: count() })
      .from(pushTopics)
      .where(eq(pushTopics.subscriptionId, sub.id));
    if (value === 0) await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
    return { remaining: value };
  });
}

export type PushRecipient = {
  subscriptionId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  pathEncrypted: string | null;
};

/** Every browser following the target. */
export async function listPushRecipients(db: AppDb, target: PushTarget): Promise<PushRecipient[]> {
  return db
    .select({
      subscriptionId: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
      pathEncrypted: pushTopics.pathEncrypted,
    })
    .from(pushTopics)
    .innerJoin(pushSubscriptions, eq(pushTopics.subscriptionId, pushSubscriptions.id))
    .where(targetWhere(target));
}

/** Records successful sends and forgets subscriptions the push service says are gone. */
export async function recordPushResults(
  db: AppDb,
  results: { sent: string[]; gone: string[] },
  now: Date = new Date(),
) {
  if (results.sent.length) {
    await db
      .update(pushSubscriptions)
      .set({ lastSentAt: now })
      .where(inArray(pushSubscriptions.id, results.sent));
  }
  if (results.gone.length) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, results.gone));
  }
}

/**
 * The browser replaced its subscription (`pushsubscriptionchange`). Knowing
 * the old endpoint (a secret URL) is what authorises moving its topics.
 */
export async function replacePushEndpoint(
  db: AppDb,
  input: { oldEndpoint: string; subscription: PushSubscriptionInput },
): Promise<boolean> {
  const { endpoint, keys } = input.subscription;
  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as AppDb;
    const [old] = await tx
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, input.oldEndpoint));
    if (!old) return false;
    if (input.oldEndpoint !== endpoint) {
      // If the new endpoint is already stored, merge into it.
      const [current] = await tx
        .select({ id: pushSubscriptions.id })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, endpoint));
      if (current) {
        await tx.execute(sql`
          insert into push_topics (subscription_id, kind, quote_id, order_id, customer_id, path_encrypted, created_at)
          select ${current.id}, kind, quote_id, order_id, customer_id, path_encrypted, created_at
          from push_topics where subscription_id = ${old.id}
          on conflict do nothing`);
        await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.id, old.id));
        await tx
          .update(pushSubscriptions)
          .set({ p256dh: keys.p256dh, auth: keys.auth, updatedAt: new Date() })
          .where(eq(pushSubscriptions.id, current.id));
        return true;
      }
    }
    await tx
      .update(pushSubscriptions)
      .set({ endpoint, p256dh: keys.p256dh, auth: keys.auth, updatedAt: new Date() })
      .where(eq(pushSubscriptions.id, old.id));
    return true;
  });
}

/** Subscriptions with nothing left to follow (e.g. after an account is deleted). */
export async function deleteIdlePushSubscriptions(db: AppDb) {
  await db
    .delete(pushSubscriptions)
    .where(
      notExists(
        db
          .select({ id: pushTopics.id })
          .from(pushTopics)
          .where(eq(pushTopics.subscriptionId, pushSubscriptions.id)),
      ),
    );
}
