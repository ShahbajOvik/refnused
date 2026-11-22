import { and, asc, count, desc, eq, inArray, isNotNull, max, min } from "drizzle-orm";

import {
  brands,
  categories,
  deviceModels,
  modelVariants,
  products,
  tradeInPrices,
} from "@/db/schema";
import type { AppDb } from "@/db/types";

import type { ModelPriceRow } from "./model-value";

/*
 * Catalogue reads for guides, sitemaps and model links. Take db as an
 * argument so they can be tested against an in-memory database.
 */

/** Trade-ins are for active IMEI categories only (same rule as the sell pages). */
const tradeInCategory = and(eq(categories.identifierType, "imei"), eq(categories.isActive, true));

/** Every model we buy (active, IMEI category, at least one trade-in price). */
export async function listTradeInModels(db: AppDb) {
  return db
    .select({
      slug: deviceModels.slug,
      name: deviceModels.name,
      brandSlug: brands.slug,
      brandName: brands.name,
      createdAt: deviceModels.createdAt,
      maxPricePence: max(tradeInPrices.pricePence),
      pricesUpdatedAt: max(tradeInPrices.updatedAt),
    })
    .from(deviceModels)
    .innerJoin(brands, eq(deviceModels.brandId, brands.id))
    .innerJoin(categories, eq(deviceModels.categoryId, categories.id))
    .innerJoin(modelVariants, eq(modelVariants.modelId, deviceModels.id))
    .innerJoin(tradeInPrices, eq(tradeInPrices.variantId, modelVariants.id))
    .where(and(eq(deviceModels.isActive, true), eq(modelVariants.isActive, true), tradeInCategory))
    .groupBy(deviceModels.id, brands.id)
    .having(isNotNull(max(tradeInPrices.pricePence)))
    .orderBy(
      asc(brands.sortOrder),
      asc(brands.name),
      desc(deviceModels.releaseYear),
      asc(deviceModels.name),
    );
}

export type TradeInModel = Awaited<ReturnType<typeof listTradeInModels>>[number];

/** One model's trade-in prices, for the "How much is my … worth?" guide. */
export async function getModelValueData(db: AppDb, modelSlug: string) {
  const [model] = await db
    .select({
      id: deviceModels.id,
      slug: deviceModels.slug,
      name: deviceModels.name,
      releaseYear: deviceModels.releaseYear,
      imageUrl: deviceModels.imageUrl,
      createdAt: deviceModels.createdAt,
      brandSlug: brands.slug,
      brandName: brands.name,
    })
    .from(deviceModels)
    .innerJoin(brands, eq(deviceModels.brandId, brands.id))
    .innerJoin(categories, eq(deviceModels.categoryId, categories.id))
    .where(and(eq(deviceModels.slug, modelSlug), eq(deviceModels.isActive, true), tradeInCategory));
  if (!model) return null;

  const rows = await db
    .select({
      storageGb: modelVariants.storageGb,
      colour: modelVariants.colour,
      grade: tradeInPrices.grade,
      pricePence: tradeInPrices.pricePence,
      updatedAt: tradeInPrices.updatedAt,
    })
    .from(tradeInPrices)
    .innerJoin(modelVariants, eq(tradeInPrices.variantId, modelVariants.id))
    .where(and(eq(modelVariants.modelId, model.id), eq(modelVariants.isActive, true)));

  // IMEI categories always have storage (categories_imei_storage_check).
  const prices: ModelPriceRow[] = rows.flatMap((r) =>
    r.storageGb === null ? [] : [{ ...r, storageGb: r.storageGb }],
  );
  if (!prices.length) return null;
  return { model, prices };
}

export type ModelLinkTarget = {
  slug: string;
  name: string;
  brandSlug: string;
  brandName: string;
  categorySlug: string;
  /** Highest trade-in base price; null when we don't buy this model. */
  maxTradeInPence: number | null;
  /** Units listed for sale now, and the cheapest one's price. */
  inStock: number;
  fromPricePence: number | null;
};

/**
 * What exists for each model across the site, so sell, shop and guide pages
 * only link to pages that have something on them.
 */
export async function getModelLinkTargets(
  db: AppDb,
  modelSlugs: string[],
): Promise<ModelLinkTarget[]> {
  const slugs = [...new Set(modelSlugs)].slice(0, 50);
  if (!slugs.length) return [];

  const models = await db
    .select({
      id: deviceModels.id,
      slug: deviceModels.slug,
      name: deviceModels.name,
      brandSlug: brands.slug,
      brandName: brands.name,
      categorySlug: categories.slug,
      identifierType: categories.identifierType,
      categoryActive: categories.isActive,
    })
    .from(deviceModels)
    .innerJoin(brands, eq(deviceModels.brandId, brands.id))
    .innerJoin(categories, eq(deviceModels.categoryId, categories.id))
    .where(and(inArray(deviceModels.slug, slugs), eq(deviceModels.isActive, true)));
  if (!models.length) return [];
  const ids = models.map((m) => m.id);

  const [tradeIns, stock] = await Promise.all([
    db
      .select({ modelId: modelVariants.modelId, maxPence: max(tradeInPrices.pricePence) })
      .from(tradeInPrices)
      .innerJoin(modelVariants, eq(tradeInPrices.variantId, modelVariants.id))
      .where(and(inArray(modelVariants.modelId, ids), eq(modelVariants.isActive, true)))
      .groupBy(modelVariants.modelId),
    db
      .select({
        modelId: modelVariants.modelId,
        units: count(),
        fromPence: min(products.pricePence),
      })
      .from(products)
      .innerJoin(modelVariants, eq(products.variantId, modelVariants.id))
      .where(and(inArray(modelVariants.modelId, ids), eq(products.status, "listed")))
      .groupBy(modelVariants.modelId),
  ]);
  const tradeInBy = new Map(tradeIns.map((t) => [t.modelId, t.maxPence]));
  const stockBy = new Map(stock.map((s) => [s.modelId, s]));

  // Keep the caller's order.
  const bySlug = new Map(
    models.map((m) => {
      const s = stockBy.get(m.id);
      const buyable = m.identifierType === "imei" && m.categoryActive;
      const maxTradeIn = buyable ? (tradeInBy.get(m.id) ?? null) : null;
      return [
        m.slug,
        {
          slug: m.slug,
          name: m.name,
          brandSlug: m.brandSlug,
          brandName: m.brandName,
          categorySlug: m.categorySlug,
          maxTradeInPence: maxTradeIn && maxTradeIn > 0 ? maxTradeIn : null,
          inStock: s?.units ?? 0,
          fromPricePence: s?.fromPence ?? null,
        } satisfies ModelLinkTarget,
      ];
    }),
  );
  return slugs.flatMap((slug) => bySlug.get(slug) ?? []);
}
