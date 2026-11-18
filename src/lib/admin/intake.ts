import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";

import {
  brands,
  deviceModels,
  inspections,
  modelVariants,
  products,
  productStatus,
  quotes,
  stores,
} from "@/db/schema";
import type { AppDb } from "@/db/types";
import { ActionError } from "@/lib/action-error";
import { recordAudit, type RequestMeta } from "@/lib/audit";
import { productSlug } from "@/lib/shop/slug";
import { imeiSchema } from "@/lib/validation/uk";

/*
 * Device intake: turning a phone (usually a trade-in) into a unit for sale,
 * and managing units afterwards. A unit can only be listed with a
 * data-wipe certificate and at least one photo.
 */

const photoSchema = z.object({
  key: z.string().regex(/^products\/[\w/.-]+$/),
  alt: z.string().trim().min(1).max(200),
});

export const intakeSchema = z.object({
  imei: imeiSchema,
  variantId: z.uuid("Choose the model, storage and colour"),
  grade: z.enum(["A", "B", "C"], "Choose the grade"),
  batteryHealthPercent: z.coerce
    .number("Enter battery health")
    .int("Whole numbers only")
    .min(0)
    .max(100, "Battery health is 0–100%"),
  pricePounds: z.coerce.number("Enter the price").positive("Enter the price").max(5000),
  storeId: z.uuid("Choose the store"),
  warrantyMonths: z.coerce.number().int().min(0).max(36).default(12),
  photos: z.array(photoSchema).max(12).default([]),
  certificateKey: z
    .string()
    .regex(/^certificates\/[\w/.-]+\.pdf$/)
    .optional()
    .transform((v) => v || null),
  sourceQuoteId: z
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  publish: z.boolean().default(false),
});
export type IntakeInput = z.output<typeof intakeSchema>;

export type ImeiLookup = {
  product: { id: string; slug: string; status: string } | null;
  quote: {
    id: string;
    reference: string;
    status: string;
    variantId: string;
    device: string;
    grade: string | null;
  } | null;
};

/** What we already know about an IMEI: an existing unit, or the trade-in it came from. */
export async function lookupImei(db: AppDb, imei: string): Promise<ImeiLookup> {
  const [[product], [quote]] = await Promise.all([
    db
      .select({ id: products.id, slug: products.slug, status: products.status })
      .from(products)
      .where(eq(products.imei, imei)),
    db
      .select({
        id: quotes.id,
        reference: quotes.reference,
        status: quotes.status,
        variantId: quotes.variantId,
        device: sql<string>`${brands.name} || ' ' || ${deviceModels.name} || ', ' || ${modelVariants.storageGb} || 'GB, ' || ${modelVariants.colour}`,
        grade: sql<
          string | null
        >`(select ${inspections.actualGrade} from ${inspections} where ${inspections.quoteId} = ${quotes.id} order by ${inspections.inspectedAt} desc limit 1)`,
      })
      .from(quotes)
      .innerJoin(modelVariants, eq(quotes.variantId, modelVariants.id))
      .innerJoin(deviceModels, eq(modelVariants.modelId, deviceModels.id))
      .innerJoin(brands, eq(deviceModels.brandId, brands.id))
      .where(and(eq(quotes.imei, imei), inArray(quotes.status, ["approved", "paid"])))
      .orderBy(desc(quotes.createdAt))
      .limit(1),
  ]);
  return { product: product ?? null, quote: quote ?? null };
}

/** All variants, for the intake model picker. */
export async function listVariantsForIntake(db: AppDb) {
  return db
    .select({
      id: modelVariants.id,
      brand: brands.name,
      model: deviceModels.name,
      modelSlug: deviceModels.slug,
      storageGb: modelVariants.storageGb,
      colour: modelVariants.colour,
    })
    .from(modelVariants)
    .innerJoin(deviceModels, eq(modelVariants.modelId, deviceModels.id))
    .innerJoin(brands, eq(deviceModels.brandId, brands.id))
    .where(and(eq(modelVariants.isActive, true), eq(deviceModels.isActive, true)))
    .orderBy(
      asc(brands.sortOrder),
      desc(deviceModels.releaseYear),
      asc(deviceModels.name),
      asc(modelVariants.storageGb),
      asc(modelVariants.colour),
    );
}

export async function createProductFromIntake(
  db: AppDb,
  input: IntakeInput & { staffId: string },
  meta?: RequestMeta,
  now = new Date(),
): Promise<{ id: string; slug: string; brandSlug: string; status: "draft" | "listed" }> {
  if (input.publish && !input.certificateKey) {
    throw new ActionError("Upload the data-wipe certificate before publishing.");
  }
  if (input.publish && input.photos.length === 0) {
    throw new ActionError("Add at least one photo before publishing.");
  }
  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as AppDb;
    const [existing] = await tx
      .select({ id: products.id })
      .from(products)
      .where(eq(products.imei, input.imei));
    if (existing)
      throw new ActionError("A unit with this IMEI already exists. Find it under Products.");
    const [variant] = await tx
      .select({
        modelSlug: deviceModels.slug,
        brandSlug: brands.slug,
        storageGb: modelVariants.storageGb,
        colour: modelVariants.colour,
      })
      .from(modelVariants)
      .innerJoin(deviceModels, eq(modelVariants.modelId, deviceModels.id))
      .innerJoin(brands, eq(deviceModels.brandId, brands.id))
      .where(eq(modelVariants.id, input.variantId));
    if (!variant) throw new ActionError("Choose the model, storage and colour.");
    const [store] = await tx
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.id, input.storeId));
    if (!store) throw new ActionError("Choose the store.");

    const status = input.publish ? "listed" : "draft";
    const [row] = await tx
      .insert(products)
      .values({
        slug: productSlug({
          modelSlug: variant.modelSlug,
          storageGb: variant.storageGb,
          colour: variant.colour,
        }),
        variantId: input.variantId,
        imei: input.imei,
        grade: input.grade,
        batteryHealthPercent: input.batteryHealthPercent,
        photos: input.photos,
        pricePence: Math.round(input.pricePounds * 100),
        storeId: input.storeId,
        status,
        dataWipeCertificateKey: input.certificateKey,
        warrantyMonths: input.warrantyMonths,
        sourceQuoteId: input.sourceQuoteId ?? null,
        listedAt: input.publish ? now : null,
      })
      .returning({ id: products.id, slug: products.slug });
    await recordAudit(
      tx,
      {
        actorType: "staff",
        actorId: input.staffId,
        action: "product.created",
        entityType: "product",
        entityId: row!.id,
        // IMEI is a device identifier, not personal data, but keep the log lean.
        changes: {
          after: {
            status,
            grade: input.grade,
            pricePence: Math.round(input.pricePounds * 100),
            storeId: input.storeId,
            photos: input.photos.length,
            certificate: Boolean(input.certificateKey),
            sourceQuoteId: input.sourceQuoteId ?? null,
          },
        },
      },
      meta,
    );
    return { id: row!.id, slug: row!.slug, brandSlug: variant.brandSlug, status };
  });
}

// Products -------------------------------------------------------------------------

export type ProductAdminRow = {
  id: string;
  slug: string;
  brandSlug: string;
  device: string;
  imei: string;
  grade: string;
  batteryHealthPercent: number;
  pricePence: number;
  status: string;
  storeName: string;
  hasCertificate: boolean;
  photos: number;
  listedAt: Date | null;
};

export async function listProductsAdmin(
  db: AppDb,
  options: { status?: string; search?: string },
): Promise<ProductAdminRow[]> {
  const q = options.search?.trim();
  return db
    .select({
      id: products.id,
      slug: products.slug,
      brandSlug: brands.slug,
      device: sql<string>`${brands.name} || ' ' || ${deviceModels.name} || ', ' || ${modelVariants.storageGb} || 'GB, ' || ${modelVariants.colour}`,
      imei: products.imei,
      grade: products.grade,
      batteryHealthPercent: products.batteryHealthPercent,
      pricePence: products.pricePence,
      status: products.status,
      storeName: sql<string>`${stores.name} || ', ' || ${stores.town}`,
      hasCertificate: sql<boolean>`${products.dataWipeCertificateKey} is not null`,
      photos: sql<number>`jsonb_array_length(${products.photos})::int`,
      listedAt: products.listedAt,
    })
    .from(products)
    .innerJoin(modelVariants, eq(products.variantId, modelVariants.id))
    .innerJoin(deviceModels, eq(modelVariants.modelId, deviceModels.id))
    .innerJoin(brands, eq(deviceModels.brandId, brands.id))
    .innerJoin(stores, eq(products.storeId, stores.id))
    .where(
      and(
        options.status && (productStatus.enumValues as readonly string[]).includes(options.status)
          ? eq(products.status, options.status as (typeof productStatus.enumValues)[number])
          : undefined,
        q
          ? or(
              eq(products.imei, q),
              ilike(products.slug, `%${q}%`),
              ilike(deviceModels.name, `%${q}%`),
            )
          : undefined,
      ),
    )
    .orderBy(desc(products.updatedAt))
    .limit(300);
}

export const productUpdateSchema = z.object({
  productId: z.uuid(),
  pricePounds: z.coerce.number().positive().max(5000).optional(),
  status: z.enum(["draft", "listed", "withdrawn"]).optional(),
  storeId: z.uuid().optional(),
});

/** Price, store and listing changes. Sold or reserved units can't be changed here. */
export async function updateProductAdmin(
  db: AppDb,
  input: z.output<typeof productUpdateSchema> & { staffId: string },
  meta?: RequestMeta,
  now = new Date(),
) {
  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as AppDb;
    const [p] = await tx
      .select({
        status: products.status,
        pricePence: products.pricePence,
        storeId: products.storeId,
        certificate: products.dataWipeCertificateKey,
        photos: products.photos,
        holdOrderId: products.checkoutHoldOrderId,
        listedAt: products.listedAt,
      })
      .from(products)
      .where(eq(products.id, input.productId))
      .for("update");
    if (!p) throw new ActionError("That unit doesn’t exist.");
    if (["sold", "reserved"].includes(p.status) || p.holdOrderId) {
      throw new ActionError(
        "This unit is sold, reserved or in someone’s checkout, so it can’t be changed.",
      );
    }
    const next: Partial<typeof products.$inferInsert> = {};
    if (input.pricePounds !== undefined) next.pricePence = Math.round(input.pricePounds * 100);
    if (input.storeId) next.storeId = input.storeId;
    if (input.status) {
      if (input.status === "listed" && (!p.certificate || p.photos.length === 0)) {
        throw new ActionError("Add a data-wipe certificate and at least one photo before listing.");
      }
      next.status = input.status;
      if (input.status === "listed" && !p.listedAt) next.listedAt = now;
    }
    const changed = Object.entries(next).filter(
      ([k, v]) => (p as Record<string, unknown>)[k] !== v,
    );
    if (!changed.length) return { changed: false };
    await tx.update(products).set(next).where(eq(products.id, input.productId));
    await recordAudit(
      tx,
      {
        actorType: "staff",
        actorId: input.staffId,
        action:
          next.pricePence !== undefined && next.pricePence !== p.pricePence
            ? "product.price_changed"
            : "product.updated",
        entityType: "product",
        entityId: input.productId,
        changes: {
          before: Object.fromEntries(changed.map(([k]) => [k, (p as Record<string, unknown>)[k]])),
          after: Object.fromEntries(changed),
        },
      },
      meta,
    );
    return { changed: true };
  });
}
