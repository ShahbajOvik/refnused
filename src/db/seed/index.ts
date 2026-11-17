import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { stores as storeConfig } from "@/config/site";
import * as schema from "@/db/schema";

import { sampleTradeInPence, seedBrands, seedModels } from "./catalogue";

export type SeedDb = PgDatabase<PgQueryResultHKT, typeof schema>;

const TRADE_IN_GRADES = schema.tradeInGrade.enumValues;

/**
 * Idempotent seed: safe to run repeatedly.
 * - Stores, brands, models and variants are upserted by their natural keys.
 * - Trade-in prices are only inserted when missing, so prices edited by
 *   staff are never overwritten.
 */
export async function seed(db: SeedDb) {
  return db.transaction(async (tx) => {
    // Stores come from src/config/site.ts, the single source of store details.
    const storeRows = await tx
      .insert(schema.stores)
      .values(
        storeConfig.map((s) => ({
          slug: s.slug,
          name: s.name,
          street: s.address.street,
          town: s.address.town,
          postcode: s.address.postcode,
          phone: s.phone,
          // TODO: add latitude/longitude and opening hours once confirmed.
        })),
      )
      .onConflictDoUpdate({
        target: schema.stores.slug,
        set: {
          name: sql`excluded.name`,
          street: sql`excluded.street`,
          town: sql`excluded.town`,
          postcode: sql`excluded.postcode`,
          phone: sql`excluded.phone`,
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: schema.stores.id });

    const brandRows = await tx
      .insert(schema.brands)
      .values([...seedBrands])
      .onConflictDoUpdate({
        target: schema.brands.slug,
        set: {
          name: sql`excluded.name`,
          sortOrder: sql`excluded.sort_order`,
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: schema.brands.id, slug: schema.brands.slug });
    const brandId = new Map(brandRows.map((b) => [b.slug, b.id]));

    const modelRows = await tx
      .insert(schema.deviceModels)
      .values(
        seedModels.map((m) => ({
          brandId: brandId.get(m.brand)!,
          name: m.name,
          slug: m.slug,
          releaseYear: m.releaseYear,
        })),
      )
      .onConflictDoUpdate({
        target: schema.deviceModels.slug,
        set: {
          brandId: sql`excluded.brand_id`,
          name: sql`excluded.name`,
          releaseYear: sql`excluded.release_year`,
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: schema.deviceModels.id, slug: schema.deviceModels.slug });
    const modelId = new Map(modelRows.map((m) => [m.slug, m.id]));

    const variantRows = await tx
      .insert(schema.modelVariants)
      .values(
        seedModels.flatMap((m) =>
          m.storageGb.flatMap((storageGb) =>
            m.colours.map((colour) => ({ modelId: modelId.get(m.slug)!, storageGb, colour })),
          ),
        ),
      )
      .onConflictDoUpdate({
        target: [
          schema.modelVariants.modelId,
          schema.modelVariants.storageGb,
          schema.modelVariants.colour,
        ],
        set: { isActive: true, updatedAt: sql`now()` },
      })
      .returning({
        id: schema.modelVariants.id,
        modelId: schema.modelVariants.modelId,
        storageGb: schema.modelVariants.storageGb,
      });

    const modelById = new Map(seedModels.map((m) => [modelId.get(m.slug)!, m]));
    const priceValues = variantRows.flatMap((v) => {
      const model = modelById.get(v.modelId)!;
      const storageIndex = model.storageGb.indexOf(v.storageGb);
      return TRADE_IN_GRADES.map((grade) => ({
        variantId: v.id,
        grade,
        pricePence: sampleTradeInPence(model.baseTradeInPence, storageIndex, grade),
      }));
    });

    const insertedPrices = await tx
      .insert(schema.tradeInPrices)
      .values(priceValues)
      .onConflictDoNothing({
        target: [schema.tradeInPrices.variantId, schema.tradeInPrices.grade],
      })
      .returning({ id: schema.tradeInPrices.id });

    await tx.insert(schema.auditLog).values({
      actorType: "system",
      action: "seed.run",
      entityType: "database",
      entityId: "seed",
      changes: {
        after: {
          stores: storeRows.length,
          models: modelRows.length,
          variants: variantRows.length,
          tradeInPricesInserted: insertedPrices.length,
        },
      },
    });

    return {
      stores: storeRows.length,
      brands: brandRows.length,
      models: modelRows.length,
      variants: variantRows.length,
      tradeInPricesInserted: insertedPrices.length,
    };
  });
}
