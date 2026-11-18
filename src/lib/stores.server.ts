import "server-only";

import { asc, eq } from "drizzle-orm";

import { stores } from "@/db/schema";
import type { AppDb } from "@/db/types";

import { type PublicStore, ukPhoneDisplay } from "./stores";

/** Active stores from the database. Kept apart from ./stores so client components can use its helpers. */
export async function listPublicStores(db: AppDb): Promise<PublicStore[]> {
  const rows = await db
    .select()
    .from(stores)
    .where(eq(stores.isActive, true))
    .orderBy(asc(stores.name), asc(stores.town));
  return rows.map((s) => ({
    slug: s.slug,
    name: s.name,
    address: { street: s.street, town: s.town, postcode: s.postcode },
    phone: s.phone,
    phoneDisplay: ukPhoneDisplay(s.phone),
    openingHours: s.openingHours,
    latitude: s.latitude,
    longitude: s.longitude,
  }));
}
