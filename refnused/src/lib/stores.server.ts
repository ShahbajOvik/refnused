import "server-only";

import { and, asc, avg, count, desc, eq } from "drizzle-orm";

import { reviews, stores } from "@refnused/database/db/schema";
import type { AppDb } from "@refnused/database/db/types";

import { type PublicStore, ukPhoneDisplay } from "@refnused/database/lib/stores";

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
    email: s.email,
    openingHours: s.openingHours,
    latitude: s.latitude,
    longitude: s.longitude,
    parkingInfo: s.parkingInfo,
    nearestMetro: s.nearestMetro,
    photos: s.photos,
  }));
}

export type StoreReview = {
  id: string;
  displayName: string;
  rating: number;
  title: string | null;
  body: string;
  isVerified: boolean;
  publishedAt: Date | null;
};

export type StoreReviews = {
  items: StoreReview[];
  count: number;
  /** Mean rating to one decimal place; null with no reviews. */
  average: number | null;
};

/** Published (moderated) reviews left for one store, newest first. */
export async function listStoreReviews(
  db: AppDb,
  storeSlug: string,
  limit = 6,
): Promise<StoreReviews> {
  const where = and(eq(stores.slug, storeSlug), eq(reviews.status, "published"));
  const [items, [summary]] = await Promise.all([
    db
      .select({
        id: reviews.id,
        displayName: reviews.displayName,
        rating: reviews.rating,
        title: reviews.title,
        body: reviews.body,
        isVerified: reviews.isVerified,
        publishedAt: reviews.publishedAt,
      })
      .from(reviews)
      .innerJoin(stores, eq(stores.id, reviews.storeId))
      .where(where)
      .orderBy(desc(reviews.publishedAt), desc(reviews.id))
      .limit(limit),
    db
      .select({ count: count(), average: avg(reviews.rating) })
      .from(reviews)
      .innerJoin(stores, eq(stores.id, reviews.storeId))
      .where(where),
  ]);
  const total = summary?.count ?? 0;
  return {
    items,
    count: total,
    average: total && summary?.average ? Math.round(Number(summary.average) * 10) / 10 : null,
  };
}
