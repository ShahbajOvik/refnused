import { randomUUID } from "node:crypto";

import { eq, inArray, sql } from "drizzle-orm";
import type { AppDb } from "../types";
import { withImeiCheckDigit } from "../../lib/validation/uk";

import { storeSeedDetails, stores as storeConfig } from "../../config/site";
import * as schema from "../schema";

import { productSlug } from "../../lib/shop/slug";

import {
  SAMPLE_COLOUR_HEX,
  SAMPLE_PHOTO_VIEWS,
  sampleTradeInPence,
  seedBrands,
  seedCategories,
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
  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as SeedDb;
    // Starting store list from src/config/site.ts. After that the database is
    // the source of truth (edited in /admin/stores), so existing stores are
    // left alone (a no-op update on a duplicate slug).
    await tx
      .insert(schema.stores)
      .values(
        storeConfig.map((s) => ({
          slug: s.slug,
          name: s.name,
          street: s.address.street,
          town: s.address.town,
          postcode: s.address.postcode,
          phone: s.phone,
        })),
      )
      .onDuplicateKeyUpdate({ set: { slug: sql`${schema.stores.slug}` } });
    // Fill starting coordinates and Metro text only where they're still empty.
    for (const [slug, d] of Object.entries(storeSeedDetails)) {
      await tx
        .update(schema.stores)
        .set({
          latitude: sql`coalesce(${schema.stores.latitude}, ${d.latitude})`,
          longitude: sql`coalesce(${schema.stores.longitude}, ${d.longitude})`,
          nearestMetro: sql`coalesce(${schema.stores.nearestMetro}, ${d.nearestMetro})`,
        })
        .where(eq(schema.stores.slug, slug));
    }
    const storeRows = await tx
      .select({ id: schema.stores.id, slug: schema.stores.slug })
      .from(schema.stores);

    // Only adds missing categories: they are edited in /admin/catalogue.
    await tx
      .insert(schema.categories)
      .values([...seedCategories])
      .onDuplicateKeyUpdate({ set: { slug: sql`${schema.categories.slug}` } });
    const [phones] = await tx
      .select({ id: schema.categories.id })
      .from(schema.categories)
      .where(eq(schema.categories.slug, "phones"));

    await tx
      .insert(schema.brands)
      .values([...seedBrands])
      .onDuplicateKeyUpdate({
        set: {
          name: sql`values(${schema.brands.name})`,
          sortOrder: sql`values(${schema.brands.sortOrder})`,
          updatedAt: sql`now(3)`,
        },
      });
    const brandRows = await tx
      .select({ id: schema.brands.id, slug: schema.brands.slug })
      .from(schema.brands)
      .where(
        inArray(
          schema.brands.slug,
          seedBrands.map((b) => b.slug),
        ),
      );
    const brandId = new Map(brandRows.map((b) => [b.slug, b.id]));

    await tx
      .insert(schema.deviceModels)
      .values(
        seedModels.map((m) => ({
          categoryId: phones!.id,
          brandId: brandId.get(m.brand)!,
          name: m.name,
          slug: m.slug,
          releaseYear: m.releaseYear,
        })),
      )
      .onDuplicateKeyUpdate({
        set: {
          brandId: sql`values(${schema.deviceModels.brandId})`,
          name: sql`values(${schema.deviceModels.name})`,
          releaseYear: sql`values(${schema.deviceModels.releaseYear})`,
          updatedAt: sql`now(3)`,
        },
      });
    const modelRows = await tx
      .select({ id: schema.deviceModels.id, slug: schema.deviceModels.slug })
      .from(schema.deviceModels)
      .where(
        inArray(
          schema.deviceModels.slug,
          seedModels.map((m) => m.slug),
        ),
      );
    const modelId = new Map(modelRows.map((m) => [m.slug, m.id]));

    await tx
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
      .onDuplicateKeyUpdate({
        set: {
          isActive: true,
          colourHex: sql`coalesce(${schema.modelVariants.colourHex}, values(${schema.modelVariants.colourHex}))`,
          updatedAt: sql`now(3)`,
        },
      });
    const seededKeys = new Set(
      seedModels.flatMap((m) =>
        m.storageGb.flatMap((storageGb) =>
          m.colours.map((colour) => `${modelId.get(m.slug)}|${storageGb}|${colour}`),
        ),
      ),
    );
    const variantRows = (
      await tx
        .select({
          id: schema.modelVariants.id,
          modelId: schema.modelVariants.modelId,
          storageGb: schema.modelVariants.storageGb,
          colour: schema.modelVariants.colour,
          configuration: schema.modelVariants.configuration,
        })
        .from(schema.modelVariants)
        .where(inArray(schema.modelVariants.modelId, [...modelId.values()]))
    ).filter(
      (v) => v.configuration === "" && seededKeys.has(`${v.modelId}|${v.storageGb}|${v.colour}`),
    );

    const modelById = new Map(seedModels.map((m) => [modelId.get(m.slug)!, m]));
    // Prices: only insert the missing ones, so staff-edited prices survive.
    const existingPrices = new Set(
      (
        await tx
          .select({ variantId: schema.tradeInPrices.variantId, grade: schema.tradeInPrices.grade })
          .from(schema.tradeInPrices)
          .where(
            inArray(
              schema.tradeInPrices.variantId,
              variantRows.map((v) => v.id),
            ),
          )
      ).map((p) => `${p.variantId}|${p.grade}`),
    );
    const priceValues = variantRows.flatMap((v) => {
      const model = modelById.get(v.modelId)!;
      const storageIndex = model.storageGb.indexOf(v.storageGb!);
      return TRADE_IN_GRADES.filter((grade) => !existingPrices.has(`${v.id}|${grade}`)).map(
        (grade) => ({
          variantId: v.id,
          grade,
          pricePence: sampleTradeInPence(model.baseTradeInPence, storageIndex, grade),
        }),
      );
    });
    if (priceValues.length) await tx.insert(schema.tradeInPrices).values(priceValues);

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
    const existingImeis = new Set(
      (
        await tx
          .select({ imei: schema.products.imei })
          .from(schema.products)
          .where(
            inArray(
              schema.products.imei,
              productValues.map((p) => p.imei),
            ),
          )
      ).map((p) => p.imei),
    );
    const newProducts = productValues.filter((p) => !existingImeis.has(p.imei));
    if (newProducts.length) await tx.insert(schema.products).values(newProducts);

    // Trade-in questions and options (only when missing).
    const existingQuestions = new Set(
      (await tx.select({ key: schema.quoteQuestions.key }).from(schema.quoteQuestions)).map(
        (q) => q.key,
      ),
    );
    const questionRows = seedQuoteQuestions
      .map((q, index) => ({ q, index }))
      .filter(({ q }) => !existingQuestions.has(q.key))
      .map(({ q, index }) => ({
        id: randomUUID(),
        key: q.key,
        section: q.section,
        title: q.title,
        help: q.help ?? null,
        sortOrder: index,
      }));
    if (questionRows.length) await tx.insert(schema.quoteQuestions).values(questionRows);
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
          tradeInPricesInserted: priceValues.length,
          productsInserted: newProducts.length,
          quoteQuestionsInserted: questionRows.length,
        },
      },
    });

    return {
      stores: storeRows.length,
      brands: brandRows.length,
      models: modelRows.length,
      variants: variantRows.length,
      tradeInPricesInserted: priceValues.length,
      productsInserted: newProducts.length,
      quoteQuestionsInserted: questionRows.length,
    };
  });
}
