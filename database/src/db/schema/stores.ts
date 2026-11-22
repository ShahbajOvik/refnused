import { sql } from "drizzle-orm";
import { boolean, double, json, mysqlTable, text, varchar } from "drizzle-orm/mysql-core";

import { id, timestamps } from "./_shared";

export type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

/** Opening hours in UK local time, "HH:MM". `null` means closed that day. */
export type OpeningHours = Record<DayOfWeek, { opens: string; closes: string } | null>;

export type StorePhoto = {
  /** R2 object key in the media bucket. */
  key: string;
  alt: string;
};

export const stores = mysqlTable("stores", {
  id: id(),
  slug: varchar({ length: 100 }).notNull().unique(),
  name: varchar({ length: 120 }).notNull(),
  street: varchar({ length: 200 }).notNull(),
  town: varchar({ length: 100 }).notNull(),
  postcode: varchar({ length: 10 }).notNull(),
  latitude: double(),
  longitude: double(),
  openingHours: json().$type<OpeningHours>(),
  /** E.164, e.g. +441913800456 */
  phone: varchar({ length: 32 }).notNull(),
  email: varchar({ length: 254 }),
  /** Shown on the store page, e.g. where to park and for how long. */
  parkingInfo: text(),
  /** Nearest Tyne and Wear Metro station, as a sentence. */
  nearestMetro: text(),
  photos: json()
    .$type<StorePhoto[]>()
    .notNull()
    .default(sql`(JSON_ARRAY())`),
  isActive: boolean().notNull().default(true),
  ...timestamps,
});
