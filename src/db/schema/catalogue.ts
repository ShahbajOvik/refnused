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

import { timestamps, tradeInGrade } from "./_shared";
import { staffUsers } from "./people";

export const brands = pgTable("brands", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull().unique(),
  slug: text().notNull().unique(),
  logoUrl: text(),
  sortOrder: integer().notNull().default(0),
  ...timestamps,
});

export const deviceModels = pgTable(
  "device_models",
  {
    id: uuid().primaryKey().defaultRandom(),
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
    storageGb: integer().notNull(),
    colour: text().notNull(),
    /** Swatch colour for the UI, e.g. #1d1d1f. */
    colourHex: text(),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    unique("model_variants_model_storage_colour_unique").on(t.modelId, t.storageGb, t.colour),
    check("model_variants_storage_check", sql`${t.storageGb} > 0`),
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
