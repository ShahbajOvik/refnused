import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { db } from "@/db";

import {
  getBrandBySlug,
  getCompareProducts,
  getProductDetail,
  getShopFacets,
  getSimilarProducts,
  getStockByStore,
  listProductParams,
  listShopBrands,
  listTradeInModels,
  searchProducts,
} from "./catalogue";
import type { ShopFilters } from "./filters";

/*
 * Cached shop reads. Stock changes often, so entries live for minutes and
 * are tagged "products" (plus "product:<id>") for revalidateTag when units
 * are listed, reserved or sold.
 */

export async function cachedSearch(filters: ShopFilters) {
  "use cache";
  cacheLife("minutes");
  cacheTag("products");
  return searchProducts(db, filters);
}

export async function cachedFacets(filters: ShopFilters) {
  "use cache";
  cacheLife("minutes");
  cacheTag("products", "catalogue", "stores");
  return getShopFacets(db, filters);
}

export async function cachedShopBrands() {
  "use cache";
  cacheLife("minutes");
  cacheTag("products", "catalogue");
  return listShopBrands(db);
}

export async function cachedBrand(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("catalogue");
  return getBrandBySlug(db, slug);
}

export async function cachedProductParams() {
  "use cache";
  cacheLife("minutes");
  cacheTag("products");
  return listProductParams(db);
}

export async function cachedProduct(brandSlug: string, slug: string) {
  "use cache";
  cacheLife("minutes");
  const product = await getProductDetail(db, brandSlug, slug);
  cacheTag("products", ...(product ? [`product:${product.id}`] : []));
  return product;
}

export async function cachedStockByStore(modelId: string, variantId: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("products", "stores");
  return getStockByStore(db, { modelId, variantId });
}

export async function cachedSimilar(input: {
  excludeId: string;
  modelId: string;
  brandId: string;
  pricePence: number;
}) {
  "use cache";
  cacheLife("minutes");
  cacheTag("products");
  return getSimilarProducts(db, input);
}

export async function cachedCompare(slugs: string[]) {
  "use cache";
  cacheLife("minutes");
  cacheTag("products");
  return getCompareProducts(db, slugs);
}

export async function cachedTradeInModels() {
  "use cache";
  cacheLife("hours");
  cacheTag("catalogue", "trade-in-prices");
  return listTradeInModels(db);
}
