import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { db } from "@refnused/database/db";
import {
  getFeaturedProducts,
  getPublishedReviews,
  getQuoteStats,
  searchModels,
  type FeaturedProduct,
  type PublishedReview,
  type QuoteStats,
} from "@/lib/catalogue/home-data";

/*
 * Cached server reads. Failures are caught *outside* the cache so a
 * database blip shows a fallback for that request without caching it.
 */

async function orFallback<T>(label: string, read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    console.error(`[catalogue] ${label} failed`, error);
    return fallback;
  }
}

async function cachedQuoteStats(): Promise<QuoteStats> {
  "use cache";
  cacheLife("minutes");
  cacheTag("trade-in-prices", "stores");
  return getQuoteStats(db);
}

async function cachedFeaturedProducts(): Promise<FeaturedProduct[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("products");
  return getFeaturedProducts(db);
}

async function cachedReviews(): Promise<PublishedReview[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("reviews");
  return getPublishedReviews(db);
}

async function cachedModelSearch(query: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("catalogue", "trade-in-prices");
  return searchModels(db, query);
}

export const loadQuoteStats = () => orFallback("quote stats", cachedQuoteStats, null);
export const loadFeaturedProducts = () =>
  orFallback("featured products", cachedFeaturedProducts, null);
export const loadReviews = () => orFallback("reviews", cachedReviews, null);
export const loadModelSearch = (query: string) =>
  orFallback("model search", () => cachedModelSearch(query), null);
