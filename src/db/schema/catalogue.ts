import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { identifierType, timestamps, tradeInGrade } from "./_shared";
import { staffUsers } from "./people";

export const brands = pgTable("brands", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull().unique(),
  slug: text().notNull().unique(),
  logoUrl: text(),
  sortOrder: integer().notNull().default(0),
  ...timestamps,
});

/**
 * What we sell, e.g. Phones or Laptops. Created in /admin/catalogue. The flags
 * decide what device intake asks for. Trade-ins are for IMEI categories only.
 */
export const categories = pgTable(
  "categories",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull().unique(),
    /** URL slug for /shop/category/[slug]. Never changes. */
    slug: text().notNull().unique(),
    description: text(),
    sortOrder: integer().notNull().default(0),
    identifierType: identifierType().notNull().default("serial"),
    hasStorage: boolean().notNull().default(true),
    hasBattery: boolean().notNull().default(true),
    requiresDataWipe: boolean().notNull().default(true),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    check("categories_slug_check", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("categories_imei_storage_check", sql`${t.identifierType} <> 'imei' or ${t.hasStorage}`),
  ],
);

export const deviceModels = pgTable(
  "device_models",
  {
    id: uuid().primaryKey().defaultRandom(),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    brandId: uuid()
      .notNull()
      .references(() => brands.id, { onDelete: "restrict" }),
    name: text().notNull(),
    slug: text().notNull().unique(),
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

export const modelVariants = pgTable(
  "model_variants",
  {
    id: uuid().primaryKey().defaultRandom(),
    modelId: uuid()
      .notNull()
      .references(() => deviceModels.id, { onDelete: "cascade" }),
    /** Null for items without storage, such as chargers. */
    storageGb: integer(),
    /** Free text for other specs, e.g. "16GB RAM, Intel Core i7". Empty if none. */
    configuration: text().notNull().default(""),
    colour: text().notNull(),
    /** Swatch colour for the UI, e.g. #1d1d1f. */
    colourHex: text(),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    unique("model_variants_model_options_unique")
      .on(t.modelId, t.storageGb, t.configuration, t.colour)
      .nullsNotDistinct(),
    check("model_variants_storage_check", sql`${t.storageGb} is null or ${t.storageGb} > 0`),
    check(
      "model_variants_colour_hex_check",
      sql`${t.colourHex} is null or ${t.colourHex} ~ '^#[0-9a-fA-F]{6}$'`,
    ),
  ],
);

/** What we pay for a variant in a given condition. One row per variant and grade. */
export const tradeInPrices = pgTable(
  "trade_in_prices",
  {
    id: uuid().primaryKey().defaultRandom(),
    variantId: uuid()
      .notNull()
      .references(() => modelVariants.id, { onDelete: "cascade" }),
    grade: tradeInGrade().notNull(),
    pricePence: integer().notNull(),
    /** Null for system/seeded prices. Every change is also written to audit_log. */
    updatedBy: uuid().references(() => staffUsers.id, { onDelete: "set null" }),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("trade_in_prices_variant_grade_unique").on(t.variantId, t.grade),
    check("trade_in_prices_price_check", sql`${t.pricePence} >= 0`),
  ],
);
