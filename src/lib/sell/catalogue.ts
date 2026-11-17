import { and, asc, desc, eq, max } from "drizzle-orm";

import { brands, deviceModels, modelVariants, stores, tradeInPrices } from "@/db/schema";
import type { AppDb } from "@/db/types";

/* Catalogue reads for the sell pages (used at build time and cached). */

export async function listSellBrands(db: AppDb) {
  return db
    .select({ slug: brands.slug, name: brands.name, logoUrl: brands.logoUrl })
    .from(brands)
    .orderBy(asc(brands.sortOrder), asc(brands.name));
}

export async function listBrandModels(db: AppDb, brandSlug: string) {
  return db
    .select({
      slug: deviceModels.slug,
      name: deviceModels.name,
      releaseYear: deviceModels.releaseYear,
      imageUrl: deviceModels.imageUrl,
      maxPricePence: max(tradeInPrices.pricePence),
    })
    .from(deviceModels)
    .innerJoin(brands, eq(deviceModels.brandId, brands.id))
    .leftJoin(modelVariants, eq(modelVariants.modelId, deviceModels.id))
    .leftJoin(tradeInPrices, eq(tradeInPrices.variantId, modelVariants.id))
    .where(and(eq(brands.slug, brandSlug), eq(deviceModels.isActive, true)))
    .groupBy(deviceModels.id)
    .orderBy(desc(deviceModels.releaseYear), asc(deviceModels.name));
}

export async function getBrand(db: AppDb, slug: string) {
  const [brand] = await db
    .select({ slug: brands.slug, name: brands.name })
    .from(brands)
    .where(eq(brands.slug, slug));
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
    .where(
      and(
        eq(deviceModels.slug, modelSlug),
        eq(brands.slug, brandSlug),
        eq(deviceModels.isActive, true),
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
    variants: priced.map((v) => ({ id: v.id, storageGb: v.storageGb, colour: v.colour })),
    maxPricePence: priced.reduce((m, v) => Math.max(m, v.maxPricePence ?? 0), 0) || null,
  };
}

export async function listSellModelParams(db: AppDb) {
  return db
    .select({ brand: brands.slug, model: deviceModels.slug })
    .from(deviceModels)
    .innerJoin(brands, eq(deviceModels.brandId, brands.id))
    .where(eq(deviceModels.isActive, true));
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
    .orderBy(asc(stores.name));
}
