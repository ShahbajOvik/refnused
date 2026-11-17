import { sql } from "drizzle-orm";
import type { AppDb } from "@/db/types";
import { withImeiCheckDigit } from "@/lib/validation/uk";

import { stores as storeConfig } from "@/config/site";
import * as schema from "@/db/schema";

import { productSlug } from "@/lib/shop/slug";

import {
  SAMPLE_COLOUR_HEX,
  SAMPLE_PHOTO_VIEWS,
  sampleTradeInPence,
  seedBrands,
  seedModels,
  seedProducts,
  seedQuoteQuestions,
} from "./catalogue";

export type SeedDb = AppDb;

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
      .returning({ id: schema.stores.id, slug: schema.stores.slug });

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
            m.colours.map((colour) => ({
              modelId: modelId.get(m.slug)!,
              storageGb,
              colour,
              colourHex: SAMPLE_COLOUR_HEX[colour] ?? null,
            })),
          ),
        ),
      )
      .onConflictDoUpdate({
        target: [
          schema.modelVariants.modelId,
          schema.modelVariants.storageGb,
          schema.modelVariants.colour,
        ],
        set: {
          isActive: true,
          colourHex: sql`coalesce(${schema.modelVariants.colourHex}, excluded.colour_hex)`,
          updatedAt: sql`now()`,
        },
      })
      .returning({
        id: schema.modelVariants.id,
        modelId: schema.modelVariants.modelId,
        storageGb: schema.modelVariants.storageGb,
        colour: schema.modelVariants.colour,
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

    // Sample refurbished stock (only inserted if the IMEI isn't there yet).
    const storeId = new Map(storeRows.map((s) => [s.slug, s.id]));
    const variantByKey = new Map(
      variantRows.map((v) => [`${v.modelId}|${v.storageGb}|${v.colour}`, v.id] as const),
    );
    const productValues = seedProducts.map((p, index) => {
      const vId = variantByKey.get(`${modelId.get(p.model)}|${p.storageGb}|${p.colour}`);
      const sId = storeId.get(p.storeSlug);
      if (!vId || !sId)
        throw new Error(
          `Seed product ${p.model} ${p.storageGb}GB ${p.colour} has no variant or store`,
        );
      const imei = withImeiCheckDigit(p.imeiBody);
      const model = seedModels.find((m) => m.slug === p.model)!;
      const status = p.status ?? "listed";
      const listedAt = new Date(Date.now() - (index + 1) * 3_600_000);
      return {
        slug: productSlug({
          modelSlug: p.model,
          storageGb: p.storageGb,
          colour: p.colour,
          suffix: p.slugSuffix,
        }),
        photos: SAMPLE_PHOTO_VIEWS.map(({ view, alt }) => ({
          key: `sample/phone-${view}.webp`,
          alt: `${alt} ${model.name} (sample photo)`,
        })),
        warrantyMonths: p.warrantyMonths ?? 12,
        soldAt: status === "sold" ? new Date(Date.now() - 86_400_000) : null,
        variantId: vId,
        imei,
        grade: p.grade,
        batteryHealthPercent: p.batteryHealthPercent,
        pricePence: p.pricePence,
        storeId: sId,
        status,
        dataWipeCertificateKey: `certificates/sample-${imei}.pdf`,
        listedAt,
      };
    });
    const insertedProducts = await tx
      .insert(schema.products)
      .values(productValues)
      .onConflictDoNothing({ target: schema.products.imei })
      .returning({ id: schema.products.id });

    // Trade-in questions and options (only when missing).
    const questionRows = await tx
      .insert(schema.quoteQuestions)
      .values(
        seedQuoteQuestions.map((q, index) => ({
          key: q.key,
          section: q.section,
          title: q.title,
          help: q.help ?? null,
          sortOrder: index,
        })),
      )
      .onConflictDoNothing({ target: schema.quoteQuestions.key })
      .returning({ id: schema.quoteQuestions.id, key: schema.quoteQuestions.key });
    const optionValues = questionRows.flatMap((row) =>
      seedQuoteQuestions
        .find((q) => q.key === row.key)!
        .options.map((o, index) => ({
          questionId: row.id,
          key: o.key,
          label: o.label,
          description: o.description ?? null,
          illustration: o.illustration ?? null,
          sortOrder: index,
          gradeCap: o.gradeCap ?? null,
          deductionBasisPoints: o.deductionBasisPoints ?? 0,
          deductionPence: o.deductionPence ?? 0,
        })),
    );
    if (optionValues.length) await tx.insert(schema.quoteAnswerOptions).values(optionValues);

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
          productsInserted: insertedProducts.length,
          quoteQuestionsInserted: questionRows.length,
        },
      },
    });

    return {
      stores: storeRows.length,
      brands: brandRows.length,
      models: modelRows.length,
      variants: variantRows.length,
      tradeInPricesInserted: insertedPrices.length,
      productsInserted: insertedProducts.length,
      quoteQuestionsInserted: questionRows.length,
    };
  });
}
