import { and, asc, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import {
  brands,
  categories,
  deviceModels,
  modelVariants,
  products,
} from "@refnused/database/db/schema";
import type { AppDb } from "@refnused/database/db/types";
import { ActionError } from "@refnused/database/lib/action-error";
import { recordAudit, type RequestMeta } from "@refnused/database/lib/audit";
import { slugify } from "@refnused/database/lib/shop/slug";

/*
 * The catalogue: categories, brands, models and their options. Slugs are
 * permanent because they are in public URLs. Nothing here is deleted, since
 * sold units and orders refer to it: items are hidden instead.
 */

export const IDENTIFIER_TYPES = ["imei", "serial", "none"] as const;
const MAX_VARIANTS_PER_SAVE = 200;
const MAX_LIST_VALUES = 30;
/** /shop/category/... is the category listing, so no brand can use that slug. */
const RESERVED_BRAND_SLUGS = new Set(["category"]);

type Actor = { staffId: string };

const name = (label: string) =>
  z.string().trim().min(1, `Enter the ${label}`).max(80, "Use 80 characters or fewer");

const categoryFields = {
  name: name("category name"),
  description: z
    .string()
    .trim()
    .max(300, "Use 300 characters or fewer")
    .optional()
    .transform((v) => v || null),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  identifierType: z.enum(IDENTIFIER_TYPES),
  hasStorage: z.boolean(),
  hasBattery: z.boolean(),
  requiresDataWipe: z.boolean(),
};
const imeiNeedsStorage = {
  check: (v: { identifierType: string; hasStorage: boolean }) =>
    v.identifierType !== "imei" || v.hasStorage,
  message: { path: ["hasStorage"], message: "Items with an IMEI must have storage" },
};

export const categoryCreateSchema = z
  .object(categoryFields)
  .refine(imeiNeedsStorage.check, imeiNeedsStorage.message);
export const categoryUpdateSchema = z
  .object({ ...categoryFields, categoryId: z.uuid(), isActive: z.boolean() })
  .refine(imeiNeedsStorage.check, imeiNeedsStorage.message);
export const brandCreateSchema = z.object({ name: name("brand name") });

const optionLists = {
  storage: z.string().trim().max(200).default(""),
  configurations: z.string().trim().max(600).default(""),
  colours: z.string().trim().max(600).default(""),
};
const releaseYear = z.coerce
  .number("Enter the release year")
  .int("Enter the release year")
  .min(2007, "Use 2007 or later")
  .max(2100, "Enter the release year");

export const modelCreateSchema = z.object({
  categoryId: z.uuid("Choose a category"),
  brandId: z.uuid("Choose a brand"),
  name: name("model name"),
  releaseYear,
  ...optionLists,
});
export const modelUpdateSchema = z.object({
  modelId: z.uuid(),
  name: name("model name"),
  releaseYear,
  isActive: z.boolean(),
});
export const variantsAddSchema = z.object({ modelId: z.uuid(), ...optionLists });
export const variantActiveSchema = z.object({ variantId: z.uuid(), isActive: z.boolean() });

/** Splits "Black, Silver" or one value per line, dropping blanks and repeats. */
export function splitOptions(text: string): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const raw of text.split(/[,\n]/)) {
    const value = raw.trim().replace(/\s+/g, " ");
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    if (value.length > 60) throw new ActionError(`“${value.slice(0, 20)}…” is too long.`);
    seen.add(key);
    values.push(value);
  }
  if (values.length > MAX_LIST_VALUES) {
    throw new ActionError(`Enter up to ${MAX_LIST_VALUES} options in each box.`);
  }
  return values;
}

/** "128, 256GB, 1TB" → [128, 256, 1024]. */
export function parseStorage(text: string): number[] {
  const sizes = splitOptions(text).map((value) => {
    const match = /^(\d+(?:\.\d+)?)\s*(gb|tb)?$/i.exec(value);
    const gb = match
      ? Number(match[1]) * (match[2]?.toLowerCase() === "tb" ? 1024 : 1)
      : Number.NaN;
    if (!Number.isInteger(gb) || gb <= 0 || gb > 65_536) {
      throw new ActionError(`“${value}” isn’t a storage size. Use sizes like 256GB or 1TB.`);
    }
    return gb;
  });
  return [...new Set(sizes)].sort((a, b) => a - b);
}

/** Every combination of the options entered for a model. */
export function buildVariantOptions(
  category: { hasStorage: boolean },
  input: { storage: string; configurations: string; colours: string },
) {
  const storage: (number | null)[] = category.hasStorage ? parseStorage(input.storage) : [null];
  const configurations = splitOptions(input.configurations);
  const colours = splitOptions(input.colours);
  if (storage.length === 0) throw new ActionError("Enter at least one storage size.");
  if (colours.length === 0) throw new ActionError("Enter at least one colour.");

  const specs = configurations.length ? configurations : [""];
  const total = storage.length * specs.length * colours.length;
  if (total > MAX_VARIANTS_PER_SAVE) {
    throw new ActionError(
      `That makes ${total} combinations. Add up to ${MAX_VARIANTS_PER_SAVE} at a time.`,
    );
  }
  return storage.flatMap((storageGb) =>
    specs.flatMap((configuration) =>
      colours.map((colour) => ({ storageGb, configuration, colour })),
    ),
  );
}

function slugOrError(text: string, label: string) {
  const slug = slugify(text);
  if (!slug) throw new ActionError(`Use letters or numbers in the ${label}.`);
  return slug;
}

async function assertNoListedStock(tx: AppDb, where: SQL | undefined, what: string) {
  const [row] = await tx
    .select({ value: count() })
    .from(products)
    .innerJoin(modelVariants, eq(products.variantId, modelVariants.id))
    .innerJoin(deviceModels, eq(modelVariants.modelId, deviceModels.id))
    .where(and(eq(products.status, "listed"), where));
  if (row && row.value > 0) {
    throw new ActionError(
      `This ${what} has ${row.value} listed ${row.value === 1 ? "unit" : "units"}. Withdraw them under Products first.`,
    );
  }
}

async function audit(
  tx: AppDb,
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string,
  after: Record<string, unknown>,
  meta?: RequestMeta,
) {
  await recordAudit(
    tx,
    {
      actorType: "staff",
      actorId: actor.staffId,
      action,
      entityType,
      entityId,
      changes: { after },
    },
    meta,
  );
}

// Categories -----------------------------------------------------------------

export async function createCategory(
  db: AppDb,
  input: z.output<typeof categoryCreateSchema> & Actor,
  meta?: RequestMeta,
) {
  const { staffId, ...values } = input;
  const slug = slugOrError(values.name, "category name");
  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as AppDb;
    const [existing] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, slug));
    if (existing) throw new ActionError("A category with that name already exists.");
    const [row] = await tx
      .insert(categories)
      .values({ ...values, slug })
      .$returningId();
    await audit(tx, { staffId }, "catalogue.category_created", "category", row!.id, values, meta);
    return { id: row!.id, slug };
  });
}

export async function updateCategory(
  db: AppDb,
  input: z.output<typeof categoryUpdateSchema> & Actor,
  meta?: RequestMeta,
) {
  const { staffId, categoryId, ...values } = input;
  await db.transaction(async (transaction) => {
    const tx = transaction as unknown as AppDb;
    const [current] = await tx
      .select()
      .from(categories)
      .where(eq(categories.id, categoryId))
      .for("update");
    if (!current) throw new ActionError("That category doesn’t exist.");

    const [units] = await tx
      .select({ value: count() })
      .from(products)
      .innerJoin(modelVariants, eq(products.variantId, modelVariants.id))
      .innerJoin(deviceModels, eq(modelVariants.modelId, deviceModels.id))
      .where(eq(deviceModels.categoryId, categoryId));
    const rulesChanged =
      current.identifierType !== values.identifierType ||
      current.hasStorage !== values.hasStorage ||
      current.hasBattery !== values.hasBattery ||
      current.requiresDataWipe !== values.requiresDataWipe;
    if (rulesChanged && (units?.value ?? 0) > 0) {
      throw new ActionError("The item rules can’t change once this category has stock.");
    }
    if (current.isActive && !values.isActive) {
      await assertNoListedStock(tx, eq(deviceModels.categoryId, categoryId), "category");
    }
    await tx.update(categories).set(values).where(eq(categories.id, categoryId));
    await audit(
      tx,
      { staffId },
      "catalogue.category_updated",
      "category",
      categoryId,
      values,
      meta,
    );
  });
}

// Brands ---------------------------------------------------------------------

export async function createBrand(
  db: AppDb,
  input: z.output<typeof brandCreateSchema> & Actor,
  meta?: RequestMeta,
) {
  const slug = slugOrError(input.name, "brand name");
  if (RESERVED_BRAND_SLUGS.has(slug)) throw new ActionError("That brand name can’t be used.");
  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as AppDb;
    const [existing] = await tx.select({ id: brands.id }).from(brands).where(eq(brands.slug, slug));
    if (existing) throw new ActionError("A brand with that name already exists.");
    const [{ next } = { next: 0 }] = await tx
      .select({ next: sql<number>`coalesce(max(${brands.sortOrder}), 0) + 1` })
      .from(brands);
    const [row] = await tx
      .insert(brands)
      .values({ name: input.name, slug, sortOrder: Number(next) })
      .$returningId();
    await audit(
      tx,
      { staffId: input.staffId },
      "catalogue.brand_created",
      "brand",
      row!.id,
      { name: input.name, slug },
      meta,
    );
    return { id: row!.id, slug };
  });
}

// Models ---------------------------------------------------------------------

export async function createModel(
  db: AppDb,
  input: z.output<typeof modelCreateSchema> & Actor,
  meta?: RequestMeta,
) {
  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as AppDb;
    const [[category], [brand]] = await Promise.all([
      tx.select().from(categories).where(eq(categories.id, input.categoryId)),
      tx.select().from(brands).where(eq(brands.id, input.brandId)),
    ]);
    if (!category) throw new ActionError("Choose a category.");
    if (!brand) throw new ActionError("Choose a brand.");
    const options = buildVariantOptions(category, input);

    // Keep short URLs, adding the brand only when two brands share a model name.
    const short = slugOrError(input.name, "model name");
    const candidates = [short, slugify(`${brand.name} ${input.name}`)];
    const taken = await tx.select({ slug: deviceModels.slug }).from(deviceModels);
    const used = new Set(taken.map((t) => t.slug));
    const slug = candidates.find((c) => !used.has(c));
    if (!slug) throw new ActionError("That model already exists.");

    const [model] = await tx
      .insert(deviceModels)
      .values({
        categoryId: category.id,
        brandId: brand.id,
        name: input.name,
        slug,
        releaseYear: input.releaseYear,
      })
      .$returningId();
    await tx.insert(modelVariants).values(options.map((o) => ({ ...o, modelId: model!.id })));
    await audit(
      tx,
      { staffId: input.staffId },
      "catalogue.model_created",
      "device_model",
      model!.id,
      { name: input.name, slug, category: category.slug, variants: options.length },
      meta,
    );
    return { id: model!.id, slug, variants: options.length };
  });
}

export async function updateModel(
  db: AppDb,
  input: z.output<typeof modelUpdateSchema> & Actor,
  meta?: RequestMeta,
) {
  const { staffId, modelId, ...values } = input;
  await db.transaction(async (transaction) => {
    const tx = transaction as unknown as AppDb;
    const [current] = await tx
      .select({ isActive: deviceModels.isActive })
      .from(deviceModels)
      .where(eq(deviceModels.id, modelId))
      .for("update");
    if (!current) throw new ActionError("That model doesn’t exist.");
    if (current.isActive && !values.isActive) {
      await assertNoListedStock(tx, eq(deviceModels.id, modelId), "model");
    }
    await tx.update(deviceModels).set(values).where(eq(deviceModels.id, modelId));
    await audit(tx, { staffId }, "catalogue.model_updated", "device_model", modelId, values, meta);
  });
}

/** Adds option combinations to a model. Hidden ones that are entered again come back. */
export async function addVariants(
  db: AppDb,
  input: z.output<typeof variantsAddSchema> & Actor,
  meta?: RequestMeta,
) {
  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as AppDb;
    const [model] = await tx
      .select({ id: deviceModels.id, hasStorage: categories.hasStorage })
      .from(deviceModels)
      .innerJoin(categories, eq(deviceModels.categoryId, categories.id))
      .where(eq(deviceModels.id, input.modelId));
    if (!model) throw new ActionError("That model doesn’t exist.");
    const options = buildVariantOptions(model, input);
    await tx
      .insert(modelVariants)
      .values(options.map((o) => ({ ...o, modelId: model.id })))
      // Existing options (model_variants_model_options_unique) are re-activated.
      .onDuplicateKeyUpdate({ set: { isActive: true, updatedAt: new Date() } });
    await audit(
      tx,
      { staffId: input.staffId },
      "catalogue.variants_added",
      "device_model",
      model.id,
      { variants: options.length },
      meta,
    );
    return options.length;
  });
}

export async function setVariantActive(
  db: AppDb,
  input: z.output<typeof variantActiveSchema> & Actor,
  meta?: RequestMeta,
) {
  await db.transaction(async (transaction) => {
    const tx = transaction as unknown as AppDb;
    const [variant] = await tx
      .select({ id: modelVariants.id })
      .from(modelVariants)
      .where(eq(modelVariants.id, input.variantId))
      .for("update");
    if (!variant) throw new ActionError("That option doesn’t exist.");
    if (!input.isActive) {
      await assertNoListedStock(tx, eq(modelVariants.id, input.variantId), "option");
    }
    await tx
      .update(modelVariants)
      .set({ isActive: input.isActive })
      .where(eq(modelVariants.id, input.variantId));
    await audit(
      tx,
      { staffId: input.staffId },
      input.isActive ? "catalogue.variant_shown" : "catalogue.variant_hidden",
      "model_variant",
      input.variantId,
      { isActive: input.isActive },
      meta,
    );
  });
}

// Reading --------------------------------------------------------------------

export async function loadCatalogue(db: AppDb) {
  const [categoryRows, brandRows, modelRows, variantRows] = await Promise.all([
    db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        description: categories.description,
        sortOrder: categories.sortOrder,
        identifierType: categories.identifierType,
        hasStorage: categories.hasStorage,
        hasBattery: categories.hasBattery,
        requiresDataWipe: categories.requiresDataWipe,
        isActive: categories.isActive,
        modelCount: sql<number>`(select count(*) from ${deviceModels} where ${deviceModels.categoryId} = ${categories.id})`,
      })
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name)),
    db
      .select({ id: brands.id, name: brands.name })
      .from(brands)
      .orderBy(asc(brands.sortOrder), asc(brands.name)),
    db
      .select({
        id: deviceModels.id,
        categoryId: deviceModels.categoryId,
        brand: brands.name,
        name: deviceModels.name,
        slug: deviceModels.slug,
        releaseYear: deviceModels.releaseYear,
        isActive: deviceModels.isActive,
      })
      .from(deviceModels)
      .innerJoin(brands, eq(deviceModels.brandId, brands.id))
      .orderBy(asc(brands.sortOrder), desc(deviceModels.releaseYear), asc(deviceModels.name)),
    db
      .select({
        id: modelVariants.id,
        modelId: modelVariants.modelId,
        storageGb: modelVariants.storageGb,
        configuration: modelVariants.configuration,
        colour: modelVariants.colour,
        isActive: modelVariants.isActive,
      })
      .from(modelVariants)
      .orderBy(
        asc(modelVariants.storageGb),
        asc(modelVariants.configuration),
        asc(modelVariants.colour),
      ),
  ]);
  return {
    categories: categoryRows,
    brands: brandRows,
    models: modelRows.map((m) => ({
      ...m,
      variants: variantRows.filter((v) => v.modelId === m.id),
    })),
  };
}

export type CatalogueData = Awaited<ReturnType<typeof loadCatalogue>>;
