import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";

import {
  brands,
  deviceModels,
  modelVariants,
  priceAlerts,
  products,
  tradeInPrices,
} from "@/db/schema";
import type { AppDb } from "@/db/types";
import { sellModelPath } from "@/lib/internal-links";
import { productPath } from "@/lib/shop/paths";

/*
 * Which price alerts have been met. Run after units are listed or repriced
 * (shop alerts) and after trade-in prices change (trade-in alerts).
 *
 * - shop: a listed unit of the model (and grade/variant, if set) costs the
 *   target or less. Links to the cheapest one.
 * - trade_in: our best trade-in price for the model (any grade, so the
 *   "up to" figure) is the target or more. Links to the model's sell page.
 *
 * An alert fires at most once per cooldown, so a price that wobbles around
 * the target doesn't notify every day.
 */

export const PRICE_ALERT_COOLDOWN_DAYS = 7;

export type TriggeredPriceAlert = {
  id: string;
  customerId: string;
  type: "shop" | "trade_in";
  model: string;
  pricePence: number;
  path: string;
};

export async function findTriggeredPriceAlerts(
  db: AppDb,
  input: { modelIds: string[]; now?: Date },
): Promise<TriggeredPriceAlert[]> {
  if (!input.modelIds.length) return [];
  const now = input.now ?? new Date();
  const cutoff = new Date(now.getTime() - PRICE_ALERT_COOLDOWN_DAYS * 86_400_000);

  const candidates = await db
    .select({
      id: priceAlerts.id,
      customerId: priceAlerts.customerId,
      type: priceAlerts.type,
      modelId: priceAlerts.modelId,
      variantId: priceAlerts.variantId,
      grade: priceAlerts.grade,
      targetPricePence: priceAlerts.targetPricePence,
      model: sql<string>`${brands.name} || ' ' || ${deviceModels.name}`,
      modelSlug: deviceModels.slug,
      brandSlug: brands.slug,
    })
    .from(priceAlerts)
    .innerJoin(deviceModels, eq(priceAlerts.modelId, deviceModels.id))
    .innerJoin(brands, eq(deviceModels.brandId, brands.id))
    .where(
      and(
        eq(priceAlerts.isActive, true),
        inArray(priceAlerts.modelId, [...new Set(input.modelIds)]),
        or(isNull(priceAlerts.lastNotifiedAt), lt(priceAlerts.lastNotifiedAt, cutoff)),
      ),
    );

  const triggered: TriggeredPriceAlert[] = [];
  for (const alert of candidates) {
    const variantFilter = alert.variantId ? eq(modelVariants.id, alert.variantId) : undefined;
    if (alert.type === "shop") {
      const [cheapest] = await db
        .select({ pricePence: products.pricePence, slug: products.slug })
        .from(products)
        .innerJoin(modelVariants, eq(products.variantId, modelVariants.id))
        .where(
          and(
            eq(products.status, "listed"),
            eq(modelVariants.modelId, alert.modelId),
            alert.grade ? eq(products.grade, alert.grade) : undefined,
            variantFilter,
          ),
        )
        .orderBy(asc(products.pricePence))
        .limit(1);
      if (cheapest && cheapest.pricePence <= alert.targetPricePence) {
        triggered.push({
          id: alert.id,
          customerId: alert.customerId,
          type: "shop",
          model: alert.model,
          pricePence: cheapest.pricePence,
          path: productPath({ brandSlug: alert.brandSlug, slug: cheapest.slug }),
        });
      }
    } else {
      const [best] = await db
        .select({ pricePence: tradeInPrices.pricePence })
        .from(tradeInPrices)
        .innerJoin(modelVariants, eq(tradeInPrices.variantId, modelVariants.id))
        .where(and(eq(modelVariants.modelId, alert.modelId), variantFilter))
        .orderBy(desc(tradeInPrices.pricePence))
        .limit(1);
      if (best && best.pricePence >= alert.targetPricePence) {
        triggered.push({
          id: alert.id,
          customerId: alert.customerId,
          type: "trade_in",
          model: alert.model,
          pricePence: best.pricePence,
          path: sellModelPath({ brandSlug: alert.brandSlug, slug: alert.modelSlug }),
        });
      }
    }
  }
  return triggered;
}

export async function markPriceAlertsNotified(db: AppDb, ids: string[], now: Date = new Date()) {
  if (!ids.length) return;
  await db.update(priceAlerts).set({ lastNotifiedAt: now }).where(inArray(priceAlerts.id, ids));
}

/** Model ids for trade-in price changes (by variant) or product changes (by product). */
export async function modelIdsFor(
  db: AppDb,
  input: { variantIds?: string[]; productIds?: string[] },
): Promise<string[]> {
  const ids = new Set<string>();
  if (input.variantIds?.length) {
    const rows = await db
      .select({ modelId: modelVariants.modelId })
      .from(modelVariants)
      .where(inArray(modelVariants.id, input.variantIds));
    rows.forEach((r) => ids.add(r.modelId));
  }
  if (input.productIds?.length) {
    const rows = await db
      .select({ modelId: modelVariants.modelId })
      .from(products)
      .innerJoin(modelVariants, eq(products.variantId, modelVariants.id))
      .where(inArray(products.id, input.productIds));
    rows.forEach((r) => ids.add(r.modelId));
  }
  return [...ids];
}
