import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { brands, deviceModels, priceAlerts, stockAlerts } from "@refnused/database/db/schema";
import { affectedRows } from "@refnused/database/db/results";
import type { AppDb } from "@refnused/database/db/types";

/*
 * Price alerts (signed-in customers) and stock alerts (made by email from
 * sold phones' pages, shown here when the email matches).
 */

export const MAX_PRICE_ALERTS = 20;

export const priceAlertSchema = z
  .object({
    type: z.enum(["shop", "trade_in"]),
    modelSlug: z.string().regex(/^[a-z0-9-]{1,80}$/, "Choose a phone"),
    grade: z.enum(["A", "B", "C"]).optional(),
    targetPounds: z.coerce
      .number("Enter a price in pounds")
      .int("Use whole pounds")
      .min(1, "Enter a price of at least £1")
      .max(5000, "Enter a price up to £5,000"),
  })
  .transform(({ type, grade, ...rest }) => ({
    ...rest,
    type,
    // Grades only apply to phones we sell.
    grade: type === "shop" ? (grade ?? null) : null,
  }));

export type PriceAlertView = {
  id: string;
  type: "shop" | "trade_in";
  model: string;
  modelSlug: string;
  brandSlug: string;
  grade: "A" | "B" | "C" | null;
  targetPricePence: number;
  isActive: boolean;
  lastNotifiedAt: Date | null;
};

export async function listPriceAlerts(db: AppDb, customerId: string): Promise<PriceAlertView[]> {
  return db
    .select({
      id: priceAlerts.id,
      type: priceAlerts.type,
      model: sql<string>`concat(${brands.name}, ' ', ${deviceModels.name})`,
      modelSlug: deviceModels.slug,
      brandSlug: brands.slug,
      grade: priceAlerts.grade,
      targetPricePence: priceAlerts.targetPricePence,
      isActive: priceAlerts.isActive,
      lastNotifiedAt: priceAlerts.lastNotifiedAt,
    })
    .from(priceAlerts)
    .innerJoin(deviceModels, eq(priceAlerts.modelId, deviceModels.id))
    .innerJoin(brands, eq(deviceModels.brandId, brands.id))
    .where(eq(priceAlerts.customerId, customerId))
    .orderBy(desc(priceAlerts.isActive), desc(priceAlerts.createdAt));
}

export type CreatePriceAlertResult =
  { ok: true; id: string } | { ok: false; reason: "unknown_model" | "limit" };

export async function createPriceAlert(
  db: AppDb,
  customerId: string,
  input: z.output<typeof priceAlertSchema>,
): Promise<CreatePriceAlertResult> {
  const [model] = await db
    .select({ id: deviceModels.id })
    .from(deviceModels)
    .where(and(eq(deviceModels.slug, input.modelSlug), eq(deviceModels.isActive, true)));
  if (!model) return { ok: false, reason: "unknown_model" };
  const [{ value } = { value: 0 }] = await db
    .select({ value: count() })
    .from(priceAlerts)
    .where(and(eq(priceAlerts.customerId, customerId), eq(priceAlerts.isActive, true)));
  if (value >= MAX_PRICE_ALERTS) return { ok: false, reason: "limit" };
  const [row] = await db
    .insert(priceAlerts)
    .values({
      customerId,
      type: input.type,
      modelId: model.id,
      grade: input.grade,
      targetPricePence: input.targetPounds * 100,
    })
    .$returningId();
  return { ok: true, id: row!.id };
}

export async function setPriceAlertActive(
  db: AppDb,
  customerId: string,
  id: string,
  isActive: boolean,
) {
  const rows = await db
    .update(priceAlerts)
    .set({ isActive })
    .where(and(eq(priceAlerts.id, id), eq(priceAlerts.customerId, customerId)));
  return affectedRows(rows) > 0;
}

export async function deletePriceAlert(db: AppDb, customerId: string, id: string) {
  const rows = await db
    .delete(priceAlerts)
    .where(and(eq(priceAlerts.id, id), eq(priceAlerts.customerId, customerId)));
  return affectedRows(rows) > 0;
}

export type StockAlertView = {
  id: string;
  model: string;
  storageGb: number | null;
  createdAt: Date;
};

/** Active "back in stock" alerts for this email. */
export async function listStockAlerts(db: AppDb, email: string): Promise<StockAlertView[]> {
  return db
    .select({
      id: stockAlerts.id,
      model: sql<string>`concat(${brands.name}, ' ', ${deviceModels.name})`,
      storageGb: stockAlerts.storageGb,
      createdAt: stockAlerts.createdAt,
    })
    .from(stockAlerts)
    .innerJoin(deviceModels, eq(stockAlerts.modelId, deviceModels.id))
    .innerJoin(brands, eq(deviceModels.brandId, brands.id))
    .where(and(eq(stockAlerts.email, email.toLowerCase()), eq(stockAlerts.isActive, true)))
    .orderBy(asc(stockAlerts.createdAt));
}

export async function stopStockAlert(db: AppDb, email: string, id: string) {
  const rows = await db
    .update(stockAlerts)
    .set({ isActive: false })
    .where(and(eq(stockAlerts.id, id), eq(stockAlerts.email, email.toLowerCase())));
  return affectedRows(rows) > 0;
}

/** Phones customers can set alerts for. */
export async function listAlertModels(db: AppDb) {
  return db
    .select({ slug: deviceModels.slug, name: deviceModels.name, brand: brands.name })
    .from(deviceModels)
    .innerJoin(brands, eq(deviceModels.brandId, brands.id))
    .where(eq(deviceModels.isActive, true))
    .orderBy(asc(brands.sortOrder), desc(deviceModels.releaseYear), asc(deviceModels.name));
}
