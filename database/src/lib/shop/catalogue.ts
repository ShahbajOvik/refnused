import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  lte,
  max,
  min,
  ne,
  sql,
  type SQL,
} from "drizzle-orm";

import type { MySqlColumn, SelectedFields } from "drizzle-orm/mysql-core";
import type { SelectResultFields } from "drizzle-orm/query-builders/select.types";

import {
  brands,
  categories,
  deviceModels,
  modelVariants,
  products,
  stores,
  tradeInPrices,
  type ProductPhoto,
} from "../../db/schema";
import type { AppDb } from "../../db/types";
import { GRADES, type Grade } from "../grades";

import { BATTERY_THRESHOLDS, SHOP_PAGE_SIZE, type ListFacet, type ShopFilters } from "./filters";
import {
  TRADE_IN_CONDITIONS,
  tradeInSaving,
  type TradeInConditionKey,
  type TradeInSaving,
} from "./product-info";
import { storageLabel } from "./variant-label";

export { storageLabel };

/*
 * Read-only shop queries. Filtering, sorting and pagination all happen in
 * the database; prices are integer pence and only formatted in the UI.
 * Only `listed` units appear in the shop. Reserved and sold units keep
 * their product page so shared links still work.
 */

export type PublicProductStatus = "listed" | "reserved" | "sold";
const PUBLIC_STATUSES: PublicProductStatus[] = ["listed", "reserved", "sold"];

export type ShopProduct = {
  id: string;
  slug: string;
  brandSlug: string;
  brand: string;
  categorySlug: string;
  categoryName: string;
  modelSlug: string;
  model: string;
  /** Null for items without storage. */
  storageGb: number | null;
  /** Other specs, e.g. "16GB RAM, Intel Core i7". Empty if none. */
  configuration: string;
  colour: string;
  colourHex: string | null;
  grade: Grade;
  /** Null for items without a battery. */
  batteryHealthPercent: number | null;
  dataWipeRequired: boolean;
  pricePence: number;
  warrantyMonths: number;
  status: PublicProductStatus;
  storeSlug: string;
  storeName: string;
  storeTown: string;
  /** First photo of the unit, if any. */
  photo: ProductPhoto | null;
  /** Fallback image of the model. */
  modelImageUrl: string | null;
  releaseYear: number;
  listedAt: Date | null;
};

const colourSlug = sql<string>`trim(both '-' from regexp_replace(lower(${modelVariants.colour}), '[^a-z0-9]+', '-'))`;

const productColumns = {
  id: products.id,
  slug: products.slug,
  brandSlug: brands.slug,
  brand: brands.name,
  categorySlug: categories.slug,
  categoryName: categories.name,
  modelSlug: deviceModels.slug,
  model: deviceModels.name,
  storageGb: modelVariants.storageGb,
  configuration: modelVariants.configuration,
  colour: modelVariants.colour,
  colourHex: modelVariants.colourHex,
  grade: products.grade,
  batteryHealthPercent: products.batteryHealthPercent,
  dataWipeRequired: products.dataWipeRequired,
  pricePence: products.pricePence,
  warrantyMonths: products.warrantyMonths,
  status: sql<PublicProductStatus>`${products.status}`,
  storeSlug: stores.slug,
  storeName: stores.name,
  storeTown: stores.town,
  photo: sql<ProductPhoto | null>`json_extract(${products.photos}, '$[0]')`,
  modelImageUrl: deviceModels.imageUrl,
  releaseYear: deviceModels.releaseYear,
  listedAt: products.listedAt,
};

/** The parts of a dynamic select used here, typed by the selected columns. */
type ProductQuery<R> = PromiseLike<R[]> & {
  where(condition: SQL | undefined): ProductQuery<R>;
  groupBy(...columns: (MySqlColumn | SQL)[]): ProductQuery<R>;
  orderBy(...columns: (MySqlColumn | SQL)[]): ProductQuery<R>;
  limit(n: number): ProductQuery<R>;
  offset(n: number): ProductQuery<R>;
};

/** products ⋈ variant ⋈ model ⋈ brand ⋈ store, ready for a where clause. */
function fromProducts<T extends SelectedFields>(
  db: AppDb,
  columns: T,
): ProductQuery<SelectResultFields<T>> {
  // Drizzle can't chain joins on a generic selection, so build it untyped
  // and type the result from the columns (inner joins: nothing nullable).
  return db
    .select(columns as SelectedFields)
    .from(products)
    .innerJoin(modelVariants, eq(products.variantId, modelVariants.id))
    .innerJoin(deviceModels, eq(modelVariants.modelId, deviceModels.id))
    .innerJoin(brands, eq(deviceModels.brandId, brands.id))
    .innerJoin(categories, eq(deviceModels.categoryId, categories.id))
    .innerJoin(stores, eq(products.storeId, stores.id))
    .$dynamic() as unknown as ProductQuery<SelectResultFields<T>>;
}

type FacetKey = ListFacet | "price" | "battery";

/** Where conditions for the filters, optionally leaving one facet out (for its counts). */
function filterConditions(filters: ShopFilters, except?: FacetKey): SQL[] {
  const conditions: SQL[] = [eq(products.status, "listed")];
  const add = (key: FacetKey, condition: SQL | undefined) => {
    if (key !== except && condition) conditions.push(condition);
  };
  if (filters.categories.length) add("categories", inArray(categories.slug, filters.categories));
  if (filters.brands.length) add("brands", inArray(brands.slug, filters.brands));
  if (filters.models.length) add("models", inArray(deviceModels.slug, filters.models));
  if (filters.grades.length) add("grades", inArray(products.grade, filters.grades));
  if (filters.storage.length) add("storage", inArray(modelVariants.storageGb, filters.storage));
  if (filters.colours.length) add("colours", inArray(colourSlug, filters.colours));
  if (filters.stores.length) add("stores", inArray(stores.slug, filters.stores));
  if (filters.minPrice !== undefined)
    add("price", gte(products.pricePence, filters.minPrice * 100));
  if (filters.maxPrice !== undefined)
    add("price", lte(products.pricePence, filters.maxPrice * 100));
  if (filters.minBattery !== undefined)
    add("battery", gte(products.batteryHealthPercent, filters.minBattery));
  return conditions;
}

const SORT_ORDER: Record<ShopFilters["sort"], SQL[]> = {
  // MySQL already sorts NULLs last in descending order.
  newest: [desc(products.listedAt)],
  "price-asc": [asc(products.pricePence)],
  "price-desc": [desc(products.pricePence)],
  "battery-desc": [desc(products.batteryHealthPercent), asc(products.pricePence)],
};

export type ShopSearchResult = {
  items: ShopProduct[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

export async function searchProducts(
  db: AppDb,
  filters: ShopFilters,
  pageSize = SHOP_PAGE_SIZE,
): Promise<ShopSearchResult> {
  const where = and(...filterConditions(filters));
  const [[totalRow], items] = await Promise.all([
    fromProducts(db, { value: count() }).where(where),
    fromProducts(db, productColumns)
      .where(where)
      // id last so pages never overlap or skip when other values tie.
      .orderBy(...SORT_ORDER[filters.sort], asc(products.id))
      .limit(pageSize)
      .offset((filters.page - 1) * pageSize),
  ]);
  const total = totalRow?.value ?? 0;
  return {
    items: items as ShopProduct[],
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    pageSize,
  };
}

export type FacetOption = {
  value: string;
  label: string;
  count: number;
  /** Swatch for colours. */
  hex?: string | null;
  /** Brand name, for grouping models. */
  group?: string;
};

export type ShopFacets = {
  categories: FacetOption[];
  brands: FacetOption[];
  models: FacetOption[];
  grades: FacetOption[];
  storage: FacetOption[];
  colours: FacetOption[];
  stores: FacetOption[];
  battery: FacetOption[];
  /** Cheapest and dearest phone matching the other filters. */
  price: { minPence: number; maxPence: number } | null;
};

/**
 * Options and counts for each filter. Each facet's counts apply every
 * *other* filter, so ticking a second brand shows how many it would add.
 */
export async function getShopFacets(db: AppDb, filters: ShopFilters): Promise<ShopFacets> {
  const where = (except: FacetKey) => and(...filterConditions(filters, except));
  const n = count();

  const [
    categoryRows,
    brandRows,
    modelRows,
    gradeRows,
    storageRows,
    colourRows,
    storeRows,
    batteryRows,
    price,
  ] = await Promise.all([
    fromProducts(db, { value: categories.slug, label: categories.name, count: n })
      .where(where("categories"))
      .groupBy(categories.id)
      .orderBy(asc(categories.sortOrder), asc(categories.name)),
    fromProducts(db, { value: brands.slug, label: brands.name, count: n })
      .where(where("brands"))
      .groupBy(brands.id)
      .orderBy(asc(brands.sortOrder), asc(brands.name)),
    fromProducts(db, {
      value: deviceModels.slug,
      label: deviceModels.name,
      group: brands.name,
      count: n,
    })
      .where(where("models"))
      .groupBy(deviceModels.id, brands.id)
      .orderBy(asc(brands.sortOrder), desc(deviceModels.releaseYear), asc(deviceModels.name)),
    fromProducts(db, { value: products.grade, count: n })
      .where(where("grades"))
      .groupBy(products.grade),
    fromProducts(db, { value: modelVariants.storageGb, count: n })
      .where(where("storage"))
      .groupBy(modelVariants.storageGb)
      .orderBy(asc(modelVariants.storageGb)),
    fromProducts(db, {
      value: colourSlug,
      label: min(modelVariants.colour),
      hex: min(modelVariants.colourHex),
      count: n,
    })
      .where(where("colours"))
      .groupBy(colourSlug)
      .orderBy(asc(colourSlug)),
    fromProducts(db, {
      value: stores.slug,
      label: sql<string>`concat(${stores.name}, ', ', ${stores.town})`,
      count: n,
    })
      .where(where("stores"))
      .groupBy(stores.id)
      .orderBy(asc(stores.name), asc(stores.town)),
    fromProducts(
      db,
      Object.fromEntries(
        BATTERY_THRESHOLDS.map((t) => [
          `t${t}`,
          sql<number>`cast(sum(case when ${products.batteryHealthPercent} >= ${t} then 1 else 0 end) as signed)`,
        ]),
      ),
    ).where(where("battery")),
    fromProducts(db, {
      minPence: min(products.pricePence),
      maxPence: max(products.pricePence),
    }).where(where("price")),
  ]);

  const byGrade = new Map(gradeRows.map((r) => [r.value, r.count]));
  const battery = (batteryRows[0] ?? {}) as Record<string, number>;
  const priceRow = price[0];

  return {
    categories: categoryRows,
    brands: brandRows,
    models: modelRows,
    grades: GRADES.map((g) => ({ value: g, label: g, count: byGrade.get(g) ?? 0 })),
    storage: storageRows.flatMap((r) =>
      r.value === null
        ? []
        : [{ value: String(r.value), label: storageLabel(r.value), count: r.count }],
    ),
    colours: colourRows.map((r) => ({ ...r, label: r.label ?? r.value })),
    stores: storeRows,
    battery: BATTERY_THRESHOLDS.map((t) => ({
      value: String(t),
      label: `${t}% or more`,
      count: Number(battery[`t${t}`] ?? 0),
    })),
    price:
      priceRow?.minPence != null && priceRow.maxPence != null
        ? { minPence: priceRow.minPence, maxPence: priceRow.maxPence }
        : null,
  };
}

export type ProductDetail = ShopProduct & {
  photos: ProductPhoto[];
  categoryId: string;
  modelId: string;
  brandId: string;
  variantId: string;
  model3dUrl: string | null;
  soldAt: Date | null;
  store: {
    slug: string;
    name: string;
    street: string;
    town: string;
    postcode: string;
    phone: string;
  };
};

/** A unit's page data. Null unless it's listed, reserved or sold under this brand. */
export async function getProductDetail(
  db: AppDb,
  brandSlug: string,
  slug: string,
): Promise<ProductDetail | null> {
  const [row] = await fromProducts(db, {
    ...productColumns,
    photos: products.photos,
    categoryId: categories.id,
    modelId: deviceModels.id,
    brandId: brands.id,
    variantId: modelVariants.id,
    model3dUrl: deviceModels.model3dUrl,
    soldAt: products.soldAt,
    storeStreet: stores.street,
    storePostcode: stores.postcode,
    storePhone: stores.phone,
  })
    .where(
      and(
        eq(products.slug, slug),
        eq(brands.slug, brandSlug),
        inArray(products.status, PUBLIC_STATUSES),
      ),
    )
    .limit(1);
  if (!row) return null;
  const { storeStreet, storePostcode, storePhone, ...product } = row;
  return {
    ...(product as Omit<ProductDetail, "store">),
    store: {
      slug: row.storeSlug,
      name: row.storeName,
      street: storeStreet,
      town: row.storeTown,
      postcode: storePostcode,
      phone: storePhone,
    },
  };
}

export type StoreStock = {
  storeSlug: string;
  storeName: string;
  storeTown: string;
  /** Listed units of the same model. */
  modelCount: number;
  /** Listed units of the same model, storage and colour. */
  variantCount: number;
};

/** In-stock units of a model at each active store (including stores with none). */
export async function getStockByStore(
  db: AppDb,
  input: { modelId: string; variantId: string },
): Promise<StoreStock[]> {
  const rows = await db
    .select({
      storeSlug: stores.slug,
      storeName: stores.name,
      storeTown: stores.town,
      modelCount: sql<number>`count(${products.id})`,
      variantCount: sql<number>`cast(sum(case when ${products.variantId} = ${input.variantId} then 1 else 0 end) as signed)`,
    })
    .from(stores)
    .leftJoin(
      products,
      and(
        eq(products.storeId, stores.id),
        eq(products.status, "listed"),
        inArray(
          products.variantId,
          db
            .select({ id: modelVariants.id })
            .from(modelVariants)
            .where(eq(modelVariants.modelId, input.modelId)),
        ),
      ),
    )
    .where(eq(stores.isActive, true))
    .groupBy(stores.id)
    .orderBy(asc(stores.name), asc(stores.town));
  return rows;
}

/**
 * Other in-stock items like this one, from the same category: same model
 * first, then same brand, then closest in price.
 */
export async function getSimilarProducts(
  db: AppDb,
  input: {
    excludeId: string;
    categoryId?: string;
    modelId: string;
    brandId: string;
    pricePence: number;
  },
  limit = 4,
): Promise<ShopProduct[]> {
  const rows = await fromProducts(db, productColumns)
    .where(
      and(
        eq(products.status, "listed"),
        ne(products.id, input.excludeId),
        input.categoryId ? eq(categories.id, input.categoryId) : undefined,
      ),
    )
    .orderBy(
      sql`(${deviceModels.id} = ${input.modelId}) desc`,
      sql`(${brands.id} = ${input.brandId}) desc`,
      sql`abs(${products.pricePence} - ${input.pricePence})`,
      asc(products.id),
    )
    .limit(limit);
  return rows as ShopProduct[];
}

/** Units for /compare, in the order asked for. Unknown slugs are skipped. */
export async function getCompareProducts(db: AppDb, slugs: string[]): Promise<ShopProduct[]> {
  if (slugs.length === 0) return [];
  const rows = (await fromProducts(db, productColumns).where(
    and(inArray(products.slug, slugs), inArray(products.status, PUBLIC_STATUSES)),
  )) as ShopProduct[];
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  return slugs.flatMap((s) => bySlug.get(s) ?? []);
}

/** Pages to prerender at build time: every unit currently for sale. */
export async function listProductParams(db: AppDb) {
  return fromProducts(db, { brand: brands.slug, slug: products.slug }).where(
    eq(products.status, "listed"),
  );
}

/** Units with a page worth indexing (for sale or reserved), for the products sitemap. */
export async function listProductSitemap(db: AppDb) {
  return fromProducts(db, {
    brand: brands.slug,
    slug: products.slug,
    updatedAt: products.updatedAt,
    photos: products.photos,
  })
    .where(inArray(products.status, ["listed", "reserved"]))
    .orderBy(desc(products.updatedAt))
    .limit(50_000);
}

/** Brands with phones in stock, for /shop/[brand]. */
export async function listShopBrands(db: AppDb) {
  return fromProducts(db, { slug: brands.slug, name: brands.name, count: count() })
    .where(eq(products.status, "listed"))
    .groupBy(brands.id)
    .orderBy(asc(brands.sortOrder), asc(brands.name));
}

/** Categories with items in stock, for the shop's category links. */
export async function listShopCategories(db: AppDb) {
  return fromProducts(db, { slug: categories.slug, name: categories.name, count: count() })
    .where(and(eq(products.status, "listed"), eq(categories.isActive, true)))
    .groupBy(categories.id)
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}

/** Visible categories, for /shop/category/[category]. */
export async function listCategoryParams(db: AppDb) {
  return db
    .select({ category: categories.slug })
    .from(categories)
    .where(eq(categories.isActive, true));
}

export async function getCategoryBySlug(db: AppDb, slug: string) {
  const [row] = await db
    .select({ slug: categories.slug, name: categories.name, description: categories.description })
    .from(categories)
    .where(and(eq(categories.slug, slug), eq(categories.isActive, true)))
    .limit(1);
  return row ?? null;
}

export async function getBrandBySlug(db: AppDb, slug: string) {
  const [row] = await db
    .select({ slug: brands.slug, name: brands.name })
    .from(brands)
    .where(eq(brands.slug, slug))
    .limit(1);
  return row ?? null;
}

// Trade-in and save --------------------------------------------------------

export type TradeInModelOption = {
  slug: string;
  name: string;
  brand: string;
  brandSlug: string;
  storage: number[];
};

/** Models (and storage sizes) we have trade-in prices for. */
export async function listTradeInModels(db: AppDb): Promise<TradeInModelOption[]> {
  const rows = await db
    .select({
      slug: deviceModels.slug,
      name: deviceModels.name,
      brand: brands.name,
      brandSlug: brands.slug,
      storage: sql<string>`group_concat(distinct ${modelVariants.storageGb} order by ${modelVariants.storageGb})`,
    })
    .from(deviceModels)
    .innerJoin(brands, eq(deviceModels.brandId, brands.id))
    .innerJoin(modelVariants, eq(modelVariants.modelId, deviceModels.id))
    .innerJoin(tradeInPrices, eq(tradeInPrices.variantId, modelVariants.id))
    .innerJoin(categories, eq(deviceModels.categoryId, categories.id))
    .where(
      and(
        eq(deviceModels.isActive, true),
        eq(modelVariants.isActive, true),
        eq(categories.isActive, true),
        eq(categories.identifierType, "imei"),
      ),
    )
    .groupBy(deviceModels.id, brands.id)
    .orderBy(asc(brands.sortOrder), desc(deviceModels.releaseYear), asc(deviceModels.name));
  return rows.map((r) => ({
    ...r,
    storage: (r.storage ?? "").split(",").filter(Boolean).map(Number),
  }));
}

export type TradeInEstimate =
  | {
      ok: true;
      saving: TradeInSaving;
      productPricePence: number;
      tradeInModel: string;
      /** Where to get a full, lockable quote. */
      sellPath: string;
    }
  | { ok: false; reason: "product_unavailable" | "no_price" };

/**
 * Trade-in-and-save estimate: the best price we pay for that model and
 * storage in that condition (any colour, unlocked), taken off this unit's
 * current price. Both prices come from the database. It's an "up to"
 * estimate, not an offer: offers come only from the sell flow's pricing
 * engine after the full condition questions.
 */
export async function estimateTradeIn(
  db: AppDb,
  input: {
    productId: string;
    modelSlug: string;
    storageGb: number;
    condition: TradeInConditionKey;
  },
): Promise<TradeInEstimate> {
  const grade = TRADE_IN_CONDITIONS.find((c) => c.key === input.condition)!.grade;
  const [[product], [trade]] = await Promise.all([
    db
      .select({ pricePence: products.pricePence })
      .from(products)
      .where(and(eq(products.id, input.productId), eq(products.status, "listed")))
      .limit(1),
    db
      .select({
        pricePence: max(tradeInPrices.pricePence),
        model: min(deviceModels.name),
        brandSlug: min(brands.slug),
      })
      .from(tradeInPrices)
      .innerJoin(modelVariants, eq(tradeInPrices.variantId, modelVariants.id))
      .innerJoin(deviceModels, eq(modelVariants.modelId, deviceModels.id))
      .innerJoin(brands, eq(deviceModels.brandId, brands.id))
      .where(
        and(
          eq(deviceModels.slug, input.modelSlug),
          eq(deviceModels.isActive, true),
          eq(modelVariants.isActive, true),
          eq(modelVariants.storageGb, input.storageGb),
          eq(tradeInPrices.grade, grade),
        ),
      ),
  ]);
  if (!product) return { ok: false, reason: "product_unavailable" };
  if (trade?.pricePence == null || !trade.model) return { ok: false, reason: "no_price" };
  return {
    ok: true,
    saving: tradeInSaving(product.pricePence, trade.pricePence),
    productPricePence: product.pricePence,
    tradeInModel: trade.model,
    sellPath: `/sell/${trade.brandSlug}/${input.modelSlug}`,
  };
}
