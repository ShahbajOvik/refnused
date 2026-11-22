import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  int,
  mysqlTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

import { id, identifierType, NOW, timestamps, tradeInGrade, ts, uuidRef } from "./_shared";
import { staffUsers } from "./people";

export const brands = mysqlTable("brands", {
  id: id(),
  name: varchar({ length: 100 }).notNull().unique(),
  slug: varchar({ length: 100 }).notNull().unique(),
  logoUrl: text(),
  sortOrder: int().notNull().default(0),
  ...timestamps,
});

/**
 * What we sell, e.g. Phones or Laptops. Created in /admin/catalogue. The flags
 * decide what device intake asks for. Trade-ins are for IMEI categories only.
 */
export const categories = mysqlTable(
  "categories",
  {
    id: id(),
    name: varchar({ length: 100 }).notNull().unique(),
    /** URL slug for /shop/category/[slug]. Never changes. */
    slug: varchar({ length: 100 }).notNull().unique(),
    description: text(),
    sortOrder: int().notNull().default(0),
    identifierType: identifierType().notNull().default("serial"),
    hasStorage: boolean().notNull().default(true),
    hasBattery: boolean().notNull().default(true),
    requiresDataWipe: boolean().notNull().default(true),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    // 'c': case-sensitive, so no capitals despite the case-insensitive collation.
    check("categories_slug_check", sql`regexp_like(${t.slug}, '^[a-z0-9]+(-[a-z0-9]+)*$', 'c')`),
    check("categories_imei_storage_check", sql`${t.identifierType} <> 'imei' or ${t.hasStorage}`),
  ],
);

export const deviceModels = mysqlTable(
  "device_models",
  {
    id: id(),
    categoryId: uuidRef()
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    brandId: uuidRef()
      .notNull()
      .references(() => brands.id, { onDelete: "restrict" }),
    name: varchar({ length: 150 }).notNull(),
    slug: varchar({ length: 150 }).notNull().unique(),
    releaseYear: smallint().notNull(),
    /** R2 URL of the static product image (also the 3D fallback). */
    imageUrl: text(),
    /** R2 URL of the glTF/GLB model for the 3D viewer. */
    model3dUrl: text(),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("device_models_brand_idx").on(t.brandId),
    index("device_models_category_idx").on(t.categoryId),
    check("device_models_release_year_check", sql`${t.releaseYear} between 2007 and 2100`),
  ],
);

export const modelVariants = mysqlTable(
  "model_variants",
  {
    id: id(),
    modelId: uuidRef()
      .notNull()
      .references(() => deviceModels.id, { onDelete: "cascade" }),
    /** Null for items without storage, such as chargers. */
    storageGb: int(),
    /** Free text for other specs, e.g. "16GB RAM, Intel Core i7". Empty if none. */
    configuration: varchar({ length: 255 }).notNull().default(""),
    colour: varchar({ length: 64 }).notNull(),
    /** Swatch colour for the UI, e.g. #1d1d1f. */
    colourHex: varchar({ length: 7 }),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    // Unique options per model; "no storage" counts as one value (-1), not
    // as distinct NULLs.
    uniqueIndex("model_variants_model_options_unique").on(
      t.modelId,
      sql`(coalesce(${t.storageGb}, -1))`,
      t.configuration,
      t.colour,
    ),
    check("model_variants_storage_check", sql`${t.storageGb} is null or ${t.storageGb} > 0`),
    check(
      "model_variants_colour_hex_check",
      sql`${t.colourHex} is null or regexp_like(${t.colourHex}, '^#[0-9a-fA-F]{6}$')`,
    ),
  ],
);

/** What we pay for a variant in a given condition. One row per variant and grade. */
export const tradeInPrices = mysqlTable(
  "trade_in_prices",
  {
    id: id(),
    variantId: uuidRef()
      .notNull()
      .references(() => modelVariants.id, { onDelete: "cascade" }),
    grade: tradeInGrade().notNull(),
    pricePence: int().notNull(),
    /** Null for system/seeded prices. Every change is also written to audit_log. */
    updatedBy: uuidRef().references(() => staffUsers.id, { onDelete: "set null" }),
    updatedAt: ts()
      .notNull()
      .default(NOW)
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("trade_in_prices_variant_grade_unique").on(t.variantId, t.grade),
    check("trade_in_prices_price_check", sql`${t.pricePence} >= 0`),
  ],
);
