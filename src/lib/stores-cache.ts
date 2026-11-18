import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { stores as configStores } from "@/config/site";
import { db } from "@/db";

import type { PublicStore } from "./stores";
import { listPublicStores } from "./stores.server";

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
  return configStores.map((s) => ({ ...s, openingHours: null, latitude: null, longitude: null }));
}
