import { boolean, doublePrecision, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { timestamps } from "./_shared";

export type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

/** Opening hours in UK local time, "HH:MM". `null` means closed that day. */
export type OpeningHours = Record<DayOfWeek, { opens: string; closes: string } | null>;

export const stores = pgTable("stores", {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  street: text().notNull(),
  town: text().notNull(),
  postcode: text().notNull(),
  latitude: doublePrecision(),
  longitude: doublePrecision(),
  openingHours: jsonb().$type<OpeningHours>(),
  /** E.164, e.g. +441913800456 */
  phone: text().notNull(),
  email: text(),
  isActive: boolean().notNull().default(true),
  ...timestamps,
});
