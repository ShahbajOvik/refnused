// @vitest-environment node
import { and, asc, eq, ne } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  customers,
  modelVariants,
  orders,
  priceAlerts,
  products,
  pushSubscriptions,
  pushTopics,
  quotes,
  tradeInPrices,
} from "@refnused/database/db/schema";
import { seed } from "@refnused/database/db/seed";
import { DEMO, seedDemoAccounts } from "@refnused/database/db/seed/demo";
import type { AppDb } from "@refnused/database/db/types";
import {
  findTriggeredPriceAlerts,
  markPriceAlertsNotified,
  modelIdsFor,
  PRICE_ALERT_COOLDOWN_DAYS,
} from "@/lib/account/price-alert-check";
import { exportCustomerData } from "@/lib/account/privacy";
import { createTestDb, testCipher } from "@refnused/database/test/db";

import {
  deleteIdlePushSubscriptions,
  hasPushTopic,
  listPushRecipients,
  MAX_TOPICS_PER_SUBSCRIPTION,
  recordPushResults,
  removePushTopic,
  replacePushEndpoint,
  savePushTopic,
  type PushTarget,
} from "@refnused/database/lib/push/service";

let db: AppDb;
let close: () => Promise<void>;
const cipher = testCipher();
let alex: string;
let alexQuote: string;
let alexOrder: string | undefined;

const KEYS = {
  p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
  auth: "tBHItJI5svbpez7KI4CCXg",
};
let n = 0;
const sub = () => ({ endpoint: `https://fcm.googleapis.com/fcm/send/test-${++n}`, keys: KEYS });

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seed(db);
  await seedDemoAccounts(db, cipher);
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.email, DEMO.quotes));
  alex = customer!.id;
  const [quote] = await db
    .select({ id: quotes.id })
    .from(quotes)
    .where(eq(quotes.customerId, alex));
  alexQuote = quote!.id;
  const [order] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.customerId, alex));
  alexOrder = order?.id;
});
afterAll(() => close?.());

describe("push topics", () => {
  it("saves a topic once, however often the browser asks", async () => {
    const s = sub();
    const target: PushTarget = { kind: "quote", quoteId: alexQuote };
    const path = cipher.encrypt("/sell/track/tok", "push_topic.path");
    expect(await savePushTopic(db, { subscription: s, target, pathEncrypted: path })).toEqual({
      ok: true,
    });
    expect(await savePushTopic(db, { subscription: s, target, pathEncrypted: path })).toEqual({
      ok: true,
    });

    const rows = await db
      .select()
      .from(pushTopics)
      .innerJoin(pushSubscriptions, eq(pushTopics.subscriptionId, pushSubscriptions.id))
      .where(eq(pushSubscriptions.endpoint, s.endpoint));
    expect(rows).toHaveLength(1);
    expect(await hasPushTopic(db, { endpoint: s.endpoint, target })).toBe(true);
    expect(
      await hasPushTopic(db, {
        endpoint: s.endpoint,
        target: { kind: "price_alerts", customerId: alex },
      }),
    ).toBe(false);

    const recipients = await listPushRecipients(db, target);
    const mine = recipients.find((r) => r.endpoint === s.endpoint)!;
    expect(cipher.decrypt(mine.pathEncrypted!, "push_topic.path")).toBe("/sell/track/tok");
  });

  it("refreshes keys when the same endpoint subscribes again", async () => {
    const s = sub();
    await savePushTopic(db, {
      subscription: s,
      target: { kind: "price_alerts", customerId: alex },
      pathEncrypted: null,
    });
    const newAuth = "AAAAAAAAAAAAAAAAAAAAAA";
    await savePushTopic(db, {
      subscription: { ...s, keys: { ...KEYS, auth: newAuth } },
      target: { kind: "price_alerts", customerId: alex },
      pathEncrypted: null,
    });
    const [row] = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, s.endpoint));
    expect(row!.auth).toBe(newAuth);
  });

  it("refuses a quote or order topic without a path to open", async () => {
    await expect(
      savePushTopic(db, {
        subscription: sub(),
        target: { kind: "quote", quoteId: alexQuote },
        pathEncrypted: null,
      }),
    ).rejects.toThrow();
  });

  it("limits how many things one browser follows", async () => {
    const s = sub();
    const people = await db
      .insert(customers)
      .values(
        Array.from({ length: MAX_TOPICS_PER_SUBSCRIPTION }, (_, i) => ({
          email: `push-limit-${i}@example.com`,
        })),
      )
      .returning({ id: customers.id });
    for (const person of people) {
      expect(
        await savePushTopic(db, {
          subscription: s,
          target: { kind: "price_alerts", customerId: person.id },
          pathEncrypted: null,
        }),
      ).toEqual({ ok: true });
    }
    expect(
      await savePushTopic(db, {
        subscription: s,
        target: { kind: "price_alerts", customerId: alex },
        pathEncrypted: null,
      }),
    ).toEqual({ ok: false, reason: "limit" });
    // Topics it already has still save (idempotent).
    expect(
      await savePushTopic(db, {
        subscription: s,
        target: { kind: "price_alerts", customerId: people[0]!.id },
        pathEncrypted: null,
      }),
    ).toEqual({ ok: true });
  });

  it("deletes the subscription when its last topic is removed", async () => {
    const s = sub();
    const path = cipher.encrypt("/x", "push_topic.path");
    await savePushTopic(db, {
      subscription: s,
      target: { kind: "quote", quoteId: alexQuote },
      pathEncrypted: path,
    });
    await savePushTopic(db, {
      subscription: s,
      target: { kind: "price_alerts", customerId: alex },
      pathEncrypted: null,
    });

    expect(
      await removePushTopic(db, {
        endpoint: s.endpoint,
        target: { kind: "quote", quoteId: alexQuote },
      }),
    ).toEqual({ remaining: 1 });
    expect(
      await removePushTopic(db, {
        endpoint: s.endpoint,
        target: { kind: "price_alerts", customerId: alex },
      }),
    ).toEqual({ remaining: 0 });
    expect(
      await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, s.endpoint)),
    ).toHaveLength(0);
    // Unknown endpoint: nothing to do.
    expect(
      await removePushTopic(db, {
        endpoint: "https://fcm.googleapis.com/fcm/send/none",
        target: { kind: "price_alerts", customerId: alex },
      }),
    ).toEqual({ remaining: 0 });
  });

  it("forgets subscriptions the push service says are gone", async () => {
    const a = sub();
    const b = sub();
    const target: PushTarget = { kind: "price_alerts", customerId: alex };
    await savePushTopic(db, { subscription: a, target, pathEncrypted: null });
    await savePushTopic(db, { subscription: b, target, pathEncrypted: null });
    const recipients = await listPushRecipients(db, target);
    const idA = recipients.find((r) => r.endpoint === a.endpoint)!.subscriptionId;
    const idB = recipients.find((r) => r.endpoint === b.endpoint)!.subscriptionId;

    await recordPushResults(db, { sent: [idA], gone: [idB] });
    const [rowA] = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.id, idA));
    expect(rowA!.lastSentAt).toBeInstanceOf(Date);
    expect(
      await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.id, idB)),
    ).toHaveLength(0);
    expect(
      await db.select().from(pushTopics).where(eq(pushTopics.subscriptionId, idB)),
    ).toHaveLength(0);
  });

  it("moves topics to a replacement subscription, merging duplicates", async () => {
    const old = sub();
    const next = sub();
    const path = cipher.encrypt("/x", "push_topic.path");
    await savePushTopic(db, {
      subscription: old,
      target: { kind: "quote", quoteId: alexQuote },
      pathEncrypted: path,
    });
    await savePushTopic(db, {
      subscription: old,
      target: { kind: "price_alerts", customerId: alex },
      pathEncrypted: null,
    });
    await savePushTopic(db, {
      subscription: next,
      target: { kind: "price_alerts", customerId: alex },
      pathEncrypted: null,
    });

    expect(await replacePushEndpoint(db, { oldEndpoint: old.endpoint, subscription: next })).toBe(
      true,
    );
    expect(
      await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, old.endpoint)),
    ).toHaveLength(0);
    expect(
      await hasPushTopic(db, {
        endpoint: next.endpoint,
        target: { kind: "quote", quoteId: alexQuote },
      }),
    ).toBe(true);
    expect(
      await hasPushTopic(db, {
        endpoint: next.endpoint,
        target: { kind: "price_alerts", customerId: alex },
      }),
    ).toBe(true);

    // Simple rename.
    const renamed = sub();
    expect(
      await replacePushEndpoint(db, { oldEndpoint: next.endpoint, subscription: renamed }),
    ).toBe(true);
    expect(
      await hasPushTopic(db, {
        endpoint: renamed.endpoint,
        target: { kind: "quote", quoteId: alexQuote },
      }),
    ).toBe(true);

    // Unknown old endpoint: refused.
    expect(
      await replacePushEndpoint(db, {
        oldEndpoint: "https://fcm.googleapis.com/fcm/send/unknown",
        subscription: sub(),
      }),
    ).toBe(false);
  });

  it("cleans up subscriptions with nothing left to follow", async () => {
    const s = sub();
    await db
      .insert(pushSubscriptions)
      .values({ endpoint: s.endpoint, p256dh: KEYS.p256dh, auth: KEYS.auth });
    await deleteIdlePushSubscriptions(db);
    expect(
      await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, s.endpoint)),
    ).toHaveLength(0);
  });

  it("shows push devices in the data export without endpoints or keys", async () => {
    const s = sub();
    await savePushTopic(db, {
      subscription: s,
      target: { kind: "price_alerts", customerId: alex },
      pathEncrypted: null,
    });
    if (alexOrder) {
      await savePushTopic(db, {
        subscription: s,
        target: { kind: "order", orderId: alexOrder },
        pathEncrypted: cipher.encrypt("/orders/t", "push_topic.path"),
      });
    }
    const data = (await exportCustomerData(db, alex))!;
    expect(data.pushNotifications.length).toBeGreaterThan(0);
    expect(data.pushNotifications[0]).toMatchObject({ pushService: "fcm.googleapis.com" });
    const json = JSON.stringify(data);
    expect(json).not.toContain(s.endpoint);
    expect(json).not.toContain(KEYS.p256dh);
    expect(json).not.toContain(KEYS.auth);
  });
});

describe("price alerts", () => {
  async function listedUnit() {
    const [unit] = await db
      .select({
        id: products.id,
        pricePence: products.pricePence,
        grade: products.grade,
        variantId: products.variantId,
        modelId: modelVariants.modelId,
      })
      .from(products)
      .innerJoin(modelVariants, eq(products.variantId, modelVariants.id))
      .where(eq(products.status, "listed"))
      .orderBy(asc(products.pricePence))
      .limit(1);
    return unit!;
  }

  /** Cheapest listed price for the model (and grade), or null. */
  async function cheapestListed(modelId: string, grade?: "A" | "B" | "C") {
    const [row] = await db
      .select({ pricePence: products.pricePence })
      .from(products)
      .innerJoin(modelVariants, eq(products.variantId, modelVariants.id))
      .where(
        and(
          eq(products.status, "listed"),
          eq(modelVariants.modelId, modelId),
          grade ? eq(products.grade, grade) : undefined,
        ),
      )
      .orderBy(asc(products.pricePence))
      .limit(1);
    return row?.pricePence ?? null;
  }

  async function alert(
    values: Partial<typeof priceAlerts.$inferInsert> & {
      modelId: string;
      type: "shop" | "trade_in";
      targetPricePence: number;
    },
  ) {
    const [row] = await db
      .insert(priceAlerts)
      .values({ customerId: alex, ...values })
      .returning({ id: priceAlerts.id });
    return row!.id;
  }

  it("fires shop alerts when the cheapest listed unit is at or under the target", async () => {
    const unit = await listedUnit();
    const atTarget = await alert({
      type: "shop",
      modelId: unit.modelId,
      targetPricePence: unit.pricePence,
    });
    const above = await alert({
      type: "shop",
      modelId: unit.modelId,
      targetPricePence: unit.pricePence - 1,
    });
    const sameGrade = await alert({
      type: "shop",
      modelId: unit.modelId,
      targetPricePence: unit.pricePence,
      grade: unit.grade,
    });
    const otherGradeValue = unit.grade === "A" ? "C" : "A";
    const otherGrade = await alert({
      type: "shop",
      modelId: unit.modelId,
      targetPricePence: unit.pricePence,
      grade: otherGradeValue,
    });
    const paused = await alert({
      type: "shop",
      modelId: unit.modelId,
      targetPricePence: unit.pricePence,
      isActive: false,
    });

    const found = await findTriggeredPriceAlerts(db, { modelIds: [unit.modelId] });
    const ids = found.map((a) => a.id);
    expect(ids).toContain(atTarget);
    expect(ids).not.toContain(above);
    expect(ids).not.toContain(paused);
    expect(ids).toContain(sameGrade);
    // A grade-specific alert only counts units of that grade.
    const otherCheapest = await cheapestListed(unit.modelId, otherGradeValue);
    expect(ids.includes(otherGrade)).toBe(
      otherCheapest !== null && otherCheapest <= unit.pricePence,
    );
    const hit = found.find((a) => a.id === atTarget)!;
    expect(hit).toMatchObject({ type: "shop", customerId: alex, pricePence: unit.pricePence });
    expect(hit.path).toMatch(/^\/shop\/[a-z0-9-]+\/[a-z0-9-]+$/);
  });

  it("ignores units that aren't listed", async () => {
    const unit = await listedUnit();
    const id = await alert({
      type: "shop",
      modelId: unit.modelId,
      targetPricePence: unit.pricePence,
    });
    await db.update(products).set({ status: "reserved" }).where(eq(products.id, unit.id));
    try {
      const found = await findTriggeredPriceAlerts(db, { modelIds: [unit.modelId] });
      const next = await cheapestListed(unit.modelId);
      expect(found.some((a) => a.id === id)).toBe(next !== null && next <= unit.pricePence);
    } finally {
      await db.update(products).set({ status: "listed" }).where(eq(products.id, unit.id));
    }
  });

  it("fires trade-in alerts when our best offer reaches the target", async () => {
    const [price] = await db
      .select({ pricePence: tradeInPrices.pricePence, modelId: modelVariants.modelId })
      .from(tradeInPrices)
      .innerJoin(modelVariants, eq(tradeInPrices.variantId, modelVariants.id))
      .where(eq(tradeInPrices.grade, "A"))
      .limit(1);
    const [best] = await db
      .select({ pricePence: tradeInPrices.pricePence })
      .from(tradeInPrices)
      .innerJoin(modelVariants, eq(tradeInPrices.variantId, modelVariants.id))
      .where(eq(modelVariants.modelId, price!.modelId))
      .orderBy(tradeInPrices.pricePence)
      .then((rows) => rows.slice(-1));

    const met = await alert({
      type: "trade_in",
      modelId: price!.modelId,
      targetPricePence: best!.pricePence,
    });
    const notYet = await alert({
      type: "trade_in",
      modelId: price!.modelId,
      targetPricePence: best!.pricePence + 1,
    });
    const found = await findTriggeredPriceAlerts(db, { modelIds: [price!.modelId] });
    expect(found.map((a) => a.id)).toContain(met);
    expect(found.map((a) => a.id)).not.toContain(notYet);
    expect(found.find((a) => a.id === met)!.path).toMatch(/^\/sell\/[a-z0-9-]+\/[a-z0-9-]+$/);
  });

  it("doesn't fire again within the cooldown", async () => {
    const unit = await listedUnit();
    const id = await alert({
      type: "shop",
      modelId: unit.modelId,
      targetPricePence: unit.pricePence,
    });
    const now = new Date();
    await markPriceAlertsNotified(db, [id], now);
    let found = await findTriggeredPriceAlerts(db, { modelIds: [unit.modelId], now });
    expect(found.map((a) => a.id)).not.toContain(id);

    const later = new Date(now.getTime() + (PRICE_ALERT_COOLDOWN_DAYS + 1) * 86_400_000);
    found = await findTriggeredPriceAlerts(db, { modelIds: [unit.modelId], now: later });
    expect(found.map((a) => a.id)).toContain(id);
  });

  it("maps changed variants and products to their models", async () => {
    const unit = await listedUnit();
    expect(await modelIdsFor(db, { productIds: [unit.id] })).toEqual([unit.modelId]);
    expect(await modelIdsFor(db, { variantIds: [unit.variantId] })).toEqual([unit.modelId]);
    expect(await modelIdsFor(db, {})).toEqual([]);
    expect(await findTriggeredPriceAlerts(db, { modelIds: [] })).toEqual([]);
  });

  it("only checks the models that changed", async () => {
    const unit = await listedUnit();
    const id = await alert({
      type: "shop",
      modelId: unit.modelId,
      targetPricePence: unit.pricePence,
    });
    const [other] = await db
      .select({ modelId: modelVariants.modelId })
      .from(modelVariants)
      .where(ne(modelVariants.modelId, unit.modelId))
      .limit(1);
    expect(other).toBeDefined();
    const found = await findTriggeredPriceAlerts(db, { modelIds: [other!.modelId] });
    expect(found.map((a) => a.id)).not.toContain(id);
  });
});
