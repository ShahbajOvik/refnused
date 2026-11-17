import { and, asc, count, desc, eq, max, sql } from "drizzle-orm";
import { z } from "zod";

import {
  brands,
  deviceModels,
  modelVariants,
  products,
  reviews,
  stores,
  tradeInPrices,
} from "@/db/schema";
import type { AppDb } from "@/db/types";

/*
 * Read-only queries for the home page and quick-quote search. Prices are
 * read from the database as integer pence; the browser only formats them.
 */

export const modelSearchQuerySchema = z
  .string()
  .trim()
  .min(2, "Type at least 2 characters")
  .max(60)
  .transform((q) => q.replace(/\s+/g, " "));

export type ModelSearchResult = {
  slug: string;
  brandSlug: string;
  name: string;
  brand: string;
  releaseYear: number;
  /** Highest trade-in price for this model (best storage, grade A). */
  maxPricePence: number | null;
};

/** Escapes LIKE wildcards in user input. */
function likeEscape(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Every word must appear in "<brand> <model>", e.g. "samsung s24". */
export async function searchModels(
  db: AppDb,
  query: string,
  limit = 8,
): Promise<ModelSearchResult[]> {
  const words = query.toLowerCase().split(" ").filter(Boolean).slice(0, 5);
  if (words.length === 0) return [];
  const haystack = sql`lower(${brands.name} || ' ' || ${deviceModels.name})`;
  const conditions = words.map((w) => sql`${haystack} like ${`%${likeEscape(w)}%`} escape '\\'`);

  const rows = await db
    .select({
      slug: deviceModels.slug,
      brandSlug: brands.slug,
      name: deviceModels.name,
      brand: brands.name,
      releaseYear: deviceModels.releaseYear,
      maxPricePence: max(tradeInPrices.pricePence),
    })
    .from(deviceModels)
    .innerJoin(brands, eq(deviceModels.brandId, brands.id))
    .leftJoin(modelVariants, eq(modelVariants.modelId, deviceModels.id))
    .leftJoin(tradeInPrices, eq(tradeInPrices.variantId, modelVariants.id))
    .where(and(eq(deviceModels.isActive, true), ...conditions))
    .groupBy(deviceModels.id, brands.id)
    .orderBy(desc(deviceModels.releaseYear), asc(deviceModels.name))
    .limit(limit);
  return rows;
}

export type QuoteStats = { models: number; maxTradeInPence: number | null; stores: number };

export async function getQuoteStats(db: AppDb): Promise<QuoteStats> {
  const [[priced], [storeCount]] = await Promise.all([
    db
      .select({
        models: sql<number>`count(distinct ${deviceModels.id})::int`,
        maxTradeInPence: max(tradeInPrices.pricePence),
      })
      .from(tradeInPrices)
      .innerJoin(modelVariants, eq(tradeInPrices.variantId, modelVariants.id))
      .innerJoin(deviceModels, eq(modelVariants.modelId, deviceModels.id))
      .where(eq(deviceModels.isActive, true)),
    db.select({ value: count() }).from(stores).where(eq(stores.isActive, true)),
  ]);
  return {
    models: priced?.models ?? 0,
    maxTradeInPence: priced?.maxTradeInPence ?? null,
    stores: storeCount?.value ?? 0,
  };
}

export type FeaturedProduct = {
  id: string;
  model: string;
  brand: string;
  storageGb: number;
  colour: string;
  grade: "A" | "B" | "C";
  batteryHealthPercent: number;
  pricePence: number;
  warrantyMonths: number;
  storeTown: string;
};

/** Most recently listed refurbished phones. */
export async function getFeaturedProducts(db: AppDb, limit = 6): Promise<FeaturedProduct[]> {
  return db
    .select({
      id: products.id,
      model: deviceModels.name,
      brand: brands.name,
      storageGb: modelVariants.storageGb,
      colour: modelVariants.colour,
      grade: products.grade,
      batteryHealthPercent: products.batteryHealthPercent,
      pricePence: products.pricePence,
      warrantyMonths: products.warrantyMonths,
      storeTown: stores.town,
    })
    .from(products)
    .innerJoin(modelVariants, eq(products.variantId, modelVariants.id))
    .innerJoin(deviceModels, eq(modelVariants.modelId, deviceModels.id))
    .innerJoin(brands, eq(deviceModels.brandId, brands.id))
    .innerJoin(stores, eq(products.storeId, stores.id))
    .where(eq(products.status, "listed"))
    .orderBy(desc(products.listedAt), asc(products.pricePence))
    .limit(limit);
}

export type PublishedReview = {
  id: string;
  displayName: string;
  rating: number;
  title: string | null;
  body: string;
  isVerified: boolean;
  publishedAt: Date | null;
};

/** Moderated, published reviews only. */
export async function getPublishedReviews(db: AppDb, limit = 6): Promise<PublishedReview[]> {
  return db
    .select({
      id: reviews.id,
      displayName: reviews.displayName,
      rating: reviews.rating,
      title: reviews.title,
      body: reviews.body,
      isVerified: reviews.isVerified,
      publishedAt: reviews.publishedAt,
    })
    .from(reviews)
    .where(eq(reviews.status, "published"))
    .orderBy(desc(reviews.publishedAt))
    .limit(limit);
}
