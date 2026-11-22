import { and, asc, desc, eq, exists, isNotNull, max, sql } from "drizzle-orm";

import {
  brands,
  categories,
  deviceModels,
  modelVariants,
  stores,
  tradeInPrices,
} from "../../db/schema";
import type { AppDb } from "../../db/types";

/* Catalogue reads for the sell pages (used at build time and cached). */

/** We only buy items identified by IMEI: laptops and accessories are sale-only. */
const tradeInCategory = and(eq(categories.identifierType, "imei"), eq(categories.isActive, true));

/** Brands with at least one model we buy. */
function brandHasTradeInModels(db: AppDb) {
  return exists(
    db
      .select({ id: deviceModels.id })
      .from(deviceModels)
      .innerJoin(categories, eq(deviceModels.categoryId, categories.id))
      .where(
        and(eq(deviceModels.brandId, brands.id), eq(deviceModels.isActive, true), tradeInCategory),
      ),
  );
}

export async function listSellBrands(db: AppDb) {
  return db
    .select({ slug: brands.slug, name: brands.name, logoUrl: brands.logoUrl })
    .from(brands)
    .where(brandHasTradeInModels(db))
    .orderBy(asc(brands.sortOrder), asc(brands.name));
}

export async function listBrandModels(db: AppDb, brandSlug: string) {
  return (
    db
      .select({
        slug: deviceModels.slug,
        name: deviceModels.name,
        releaseYear: deviceModels.releaseYear,
        imageUrl: deviceModels.imageUrl,
        maxPricePence: max(tradeInPrices.pricePence),
      })
      .from(deviceModels)
      .innerJoin(brands, eq(deviceModels.brandId, brands.id))
      .innerJoin(categories, eq(deviceModels.categoryId, categories.id))
      .leftJoin(modelVariants, eq(modelVariants.modelId, deviceModels.id))
      .leftJoin(tradeInPrices, eq(tradeInPrices.variantId, modelVariants.id))
      .where(and(eq(brands.slug, brandSlug), eq(deviceModels.isActive, true), tradeInCategory))
      .groupBy(deviceModels.id)
      // A new model appears once its trade-in prices are set in /admin/prices.
      .having(isNotNull(max(tradeInPrices.pricePence)))
      .orderBy(desc(deviceModels.releaseYear), asc(deviceModels.name))
  );
}

export async function getBrand(db: AppDb, slug: string) {
  const [brand] = await db
    .select({ slug: brands.slug, name: brands.name })
    .from(brands)
    .where(and(eq(brands.slug, slug), brandHasTradeInModels(db)));
  return brand ?? null;
}

export async function getSellModel(db: AppDb, brandSlug: string, modelSlug: string) {
  const [model] = await db
    .select({
      id: deviceModels.id,
      slug: deviceModels.slug,
      name: deviceModels.name,
      releaseYear: deviceModels.releaseYear,
      imageUrl: deviceModels.imageUrl,
      brandName: brands.name,
      brandSlug: brands.slug,
    })
    .from(deviceModels)
    .innerJoin(brands, eq(deviceModels.brandId, brands.id))
    .innerJoin(categories, eq(deviceModels.categoryId, categories.id))
    .where(
      and(
        eq(deviceModels.slug, modelSlug),
        eq(brands.slug, brandSlug),
        eq(deviceModels.isActive, true),
        tradeInCategory,
      ),
    );
  if (!model) return null;

  const variants = await db
    .select({
      id: modelVariants.id,
      storageGb: modelVariants.storageGb,
      colour: modelVariants.colour,
      maxPricePence: max(tradeInPrices.pricePence),
    })
    .from(modelVariants)
    .leftJoin(tradeInPrices, eq(tradeInPrices.variantId, modelVariants.id))
    .where(and(eq(modelVariants.modelId, model.id), eq(modelVariants.isActive, true)))
    .groupBy(modelVariants.id)
    .orderBy(asc(modelVariants.storageGb), asc(modelVariants.colour));

  const priced = variants.filter((v) => v.maxPricePence !== null);
  return {
    ...model,
    // IMEI categories always have storage (categories_imei_storage_check).
    variants: priced.map((v) => ({ id: v.id, storageGb: v.storageGb!, colour: v.colour })),
    maxPricePence: priced.reduce((m, v) => Math.max(m, v.maxPricePence ?? 0), 0) || null,
  };
}

export async function listSellModelParams(db: AppDb) {
  return db
    .select({ brand: brands.slug, model: deviceModels.slug })
    .from(deviceModels)
    .innerJoin(brands, eq(deviceModels.brandId, brands.id))
    .innerJoin(categories, eq(deviceModels.categoryId, categories.id))
    .where(
      and(
        eq(deviceModels.isActive, true),
        tradeInCategory,
        sql`exists (select 1 from ${modelVariants} inner join ${tradeInPrices} on ${tradeInPrices.variantId} = ${modelVariants.id} where ${modelVariants.modelId} = ${deviceModels.id})`,
      ),
    );
}

export async function listDropOffStores(db: AppDb) {
  return db
    .select({
      id: stores.id,
      name: stores.name,
      street: stores.street,
      town: stores.town,
      postcode: stores.postcode,
      phone: stores.phone,
    })
    .from(stores)
    .where(eq(stores.isActive, true))
    .orderBy(asc(stores.name), asc(stores.town));
}
