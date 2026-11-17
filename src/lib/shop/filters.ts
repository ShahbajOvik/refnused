import { z } from "zod";

import { GRADES, type Grade } from "@/lib/grades";

/*
 * Shop filters live in the URL so a filtered page can be shared:
 *
 *   /shop?brand=apple,samsung&grade=A&storage=128&min=200&max=500&battery=90&sort=price-asc&page=2
 *
 * Parsing is forgiving (unknown or malformed values are dropped, never an
 * error page), and serialising is canonical (sorted, defaults left out), so
 * the same filters always give the same URL. Safe to import in the browser.
 */

export const SHOP_SORTS = ["newest", "price-asc", "price-desc", "battery-desc"] as const;
export type ShopSort = (typeof SHOP_SORTS)[number];
export const DEFAULT_SORT: ShopSort = "newest";

export const SORT_LABELS: Record<ShopSort, string> = {
  newest: "Newest first",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  "battery-desc": "Battery health: highest first",
};

/** Minimum battery health options, in percent. */
export const BATTERY_THRESHOLDS = [95, 90, 85, 80] as const;

export const SHOP_PAGE_SIZE = 24;
const MAX_VALUES = 20;
const MAX_PAGE = 500;
/** £100,000 in whole pounds: far above any phone, keeps integers small. */
const MAX_POUNDS = 100_000;

export type ShopFilters = {
  brands: string[];
  models: string[];
  grades: Grade[];
  storage: number[];
  colours: string[];
  stores: string[];
  /** Whole pounds. */
  minPrice?: number;
  maxPrice?: number;
  /** Minimum battery health, percent. */
  minBattery?: number;
  sort: ShopSort;
  page: number;
};

export const EMPTY_FILTERS: ShopFilters = {
  brands: [],
  models: [],
  grades: [],
  storage: [],
  colours: [],
  stores: [],
  sort: DEFAULT_SORT,
  page: 1,
};

/** Facets that are lists of values (checkbox groups). */
export type ListFacet = "brands" | "models" | "grades" | "storage" | "colours" | "stores";

/** URL parameter for each filter. */
export const PARAM = {
  brands: "brand",
  models: "model",
  grades: "grade",
  storage: "storage",
  colours: "colour",
  stores: "store",
  minPrice: "min",
  maxPrice: "max",
  minBattery: "battery",
  sort: "sort",
  page: "page",
} as const satisfies Record<keyof ShopFilters, string>;

export type RawSearchParams = Record<string, string | string[] | undefined>;

const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .max(80);
const gradeSchema = z.enum(GRADES);
const storageSchema = z.coerce.number().int().positive().max(4096);
const poundsSchema = z.coerce.number().int().min(0).max(MAX_POUNDS);

/** All values of a parameter, accepting both `a=x&a=y` (plain forms) and `a=x,y`. */
function valuesOf(raw: RawSearchParams | URLSearchParams, key: string): string[] {
  const value = raw instanceof URLSearchParams ? raw.getAll(key) : raw[key];
  const list = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return list
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
}

function firstOf(raw: RawSearchParams | URLSearchParams, key: string): string | undefined {
  return valuesOf(raw, key)[0];
}

function parseList<T extends string | number>(values: string[], schema: z.ZodType<T>): T[] {
  const parsed = new Set<T>();
  for (const value of values) {
    const result = schema.safeParse(value);
    if (result.success) parsed.add(result.data);
    if (parsed.size >= MAX_VALUES) break;
  }
  return [...parsed].sort((a, b) =>
    typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b)),
  );
}

function parseOptional<T>(value: string | undefined, schema: z.ZodType<T>): T | undefined {
  if (value === undefined || value === "") return undefined;
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
}

/** Parses Next.js searchParams (or URLSearchParams / FormData entries) into filters. */
export function parseShopFilters(raw: RawSearchParams | URLSearchParams): ShopFilters {
  let minPrice = parseOptional(firstOf(raw, PARAM.minPrice), poundsSchema);
  let maxPrice = parseOptional(firstOf(raw, PARAM.maxPrice), poundsSchema);
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }
  const battery = parseOptional(firstOf(raw, PARAM.minBattery), z.coerce.number().int());
  const sort = parseOptional(firstOf(raw, PARAM.sort), z.enum(SHOP_SORTS)) ?? DEFAULT_SORT;
  const page =
    parseOptional(firstOf(raw, PARAM.page), z.coerce.number().int().min(1).max(MAX_PAGE)) ?? 1;

  return {
    brands: parseList(valuesOf(raw, PARAM.brands), slugSchema),
    models: parseList(valuesOf(raw, PARAM.models), slugSchema),
    grades: parseList(valuesOf(raw, PARAM.grades), gradeSchema),
    storage: parseList(valuesOf(raw, PARAM.storage), storageSchema),
    colours: parseList(valuesOf(raw, PARAM.colours), slugSchema),
    stores: parseList(valuesOf(raw, PARAM.stores), slugSchema),
    minPrice: minPrice || undefined,
    maxPrice,
    minBattery: (BATTERY_THRESHOLDS as readonly number[]).includes(battery ?? -1)
      ? battery
      : undefined,
    sort,
    page,
  };
}

/** Canonical query string (without "?"), e.g. "brand=apple,samsung&sort=price-asc". */
export function serializeShopFilters(filters: ShopFilters, options: { omit?: string[] } = {}) {
  const parts: string[] = [];
  const add = (key: string, value: string | number | undefined) => {
    if (value === undefined || value === "" || options.omit?.includes(key)) return;
    parts.push(`${key}=${encodeURIComponent(String(value)).replace(/%2C/g, ",")}`);
  };
  const list = (values: (string | number)[]) => (values.length ? values.join(",") : undefined);

  add(PARAM.brands, list(filters.brands));
  add(PARAM.models, list(filters.models));
  add(PARAM.grades, list(filters.grades));
  add(PARAM.storage, list(filters.storage));
  add(PARAM.colours, list(filters.colours));
  add(PARAM.stores, list(filters.stores));
  add(PARAM.minPrice, filters.minPrice);
  add(PARAM.maxPrice, filters.maxPrice);
  add(PARAM.minBattery, filters.minBattery);
  add(PARAM.sort, filters.sort === DEFAULT_SORT ? undefined : filters.sort);
  add(PARAM.page, filters.page > 1 ? filters.page : undefined);
  return parts.join("&");
}

/** Path plus canonical query for these filters. */
export function shopHref(filters: ShopFilters, basePath = "/shop") {
  const query = serializeShopFilters(filters);
  return query ? `${basePath}?${query}` : basePath;
}

/** Copy of the filters with any change, going back to page 1. */
export function withFilters(filters: ShopFilters, change: Partial<ShopFilters>): ShopFilters {
  return { ...filters, page: 1, ...change };
}

/** Removes one value from a list facet (for "remove filter" chips). */
export function withoutValue<F extends ListFacet>(
  filters: ShopFilters,
  facet: F,
  value: ShopFilters[F][number],
): ShopFilters {
  return withFilters(filters, {
    [facet]: (filters[facet] as (string | number)[]).filter((v) => v !== value),
  });
}

/** True when anything other than sort and page is set. */
export function hasActiveFilters(filters: ShopFilters) {
  return (
    filters.brands.length +
      filters.models.length +
      filters.grades.length +
      filters.storage.length +
      filters.colours.length +
      filters.stores.length >
      0 ||
    filters.minPrice !== undefined ||
    filters.maxPrice !== undefined ||
    filters.minBattery !== undefined
  );
}

/**
 * Only plain listings are indexed: /shop and /shop/[brand], first page,
 * default sort. Every filtered combination is noindex (but followed), so
 * search engines don't crawl thousands of near-duplicate pages.
 */
export function isIndexableListing(filters: ShopFilters) {
  return !hasActiveFilters(filters) && filters.sort === DEFAULT_SORT && filters.page === 1;
}
