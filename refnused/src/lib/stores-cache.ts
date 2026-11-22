import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { stores as configStores } from "@refnused/database/config/site";
import { db } from "@refnused/database/db";
import { EMPTY_FILTERS } from "@refnused/database/lib/shop/filters";
import { searchProducts } from "@refnused/database/lib/shop/catalogue";

import type { PublicStore } from "@refnused/database/lib/stores";
import { listPublicStores, listStoreReviews, type StoreReviews } from "./stores.server";

async function cachedStores(): Promise<PublicStore[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("stores");
  return listPublicStores(db);
}

/** Active stores for the public site. Falls back to the seed list if the database is down. */
export async function loadPublicStores(): Promise<PublicStore[]> {
  try {
    const rows = await cachedStores();
    if (rows.length) return rows;
  } catch (error) {
    console.error("[stores] load failed", error);
  }
  return configStores.map((s) => ({
    ...s,
    email: null,
    openingHours: null,
    latitude: null,
    longitude: null,
    parkingInfo: null,
    nearestMetro: null,
    photos: [],
  }));
}

export async function loadPublicStore(slug: string): Promise<PublicStore | null> {
  return (await loadPublicStores()).find((s) => s.slug === slug) ?? null;
}

async function cachedStoreReviews(slug: string): Promise<StoreReviews> {
  "use cache";
  cacheLife("hours");
  cacheTag("reviews", "stores");
  return listStoreReviews(db, slug);
}

export async function loadStoreReviews(slug: string): Promise<StoreReviews> {
  try {
    return await cachedStoreReviews(slug);
  } catch (error) {
    console.error("[stores] reviews failed", error);
    return { items: [], count: 0, average: null };
  }
}

/** Phones for sale at this store (newest first), and how many in total. */
async function cachedStoreStock(slug: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("products", "stores");
  return searchProducts(db, { ...EMPTY_FILTERS, stores: [slug] }, 8);
}

export async function loadStoreStock(slug: string) {
  try {
    return await cachedStoreStock(slug);
  } catch (error) {
    console.error("[stores] stock failed", error);
    return null;
  }
}
