import { and, asc, desc, eq, inArray, like, sql } from "drizzle-orm";
import { z } from "zod";

import {
  auditLog,
  brands,
  categories,
  deviceModels,
  modelVariants,
  products,
  staffUsers,
  tradeInPrices,
} from "@refnused/database/db/schema";
import type { AppDb } from "@refnused/database/db/types";
import { recordAudit, type RequestMeta } from "@refnused/database/lib/audit";
import { parseCsv, toCsv } from "@/lib/csv";

/*
 * Trade-in price manager: what we pay per variant and grade. Every change
 * is written to audit_log (action "price.update"), which is the history.
 */

export const PRICE_GRADES = ["A", "B", "C", "faulty"] as const;
export type PriceGrade = (typeof PRICE_GRADES)[number];
export const MAX_PRICE_PENCE = 500_000;

export type PriceRow = {
  variantId: string;
  brand: string;
  model: string;
  modelSlug: string;
  storageGb: number | null;
  colour: string;
  prices: Partial<Record<PriceGrade, number>>;
  /** Average price of this variant in the shop, by grade (listed units). */
  sellingPence: Partial<Record<"A" | "B" | "C", number>>;
};

export async function listModelsForPrices(db: AppDb) {
  return db
    .select({ slug: deviceModels.slug, name: deviceModels.name, brand: brands.name })
    .from(deviceModels)
    .innerJoin(brands, eq(deviceModels.brandId, brands.id))
    .innerJoin(categories, eq(deviceModels.categoryId, categories.id))
    .where(eq(categories.identifierType, "imei"))
    .orderBy(asc(brands.sortOrder), desc(deviceModels.releaseYear), asc(deviceModels.name));
}

export async function getPriceTable(db: AppDb, modelSlug?: string): Promise<PriceRow[]> {
  const variants = await db
    .select({
      variantId: modelVariants.id,
      brand: brands.name,
      model: deviceModels.name,
      modelSlug: deviceModels.slug,
      storageGb: modelVariants.storageGb,
      colour: modelVariants.colour,
    })
    .from(modelVariants)
    .innerJoin(deviceModels, eq(modelVariants.modelId, deviceModels.id))
    .innerJoin(brands, eq(deviceModels.brandId, brands.id))
    .innerJoin(categories, eq(deviceModels.categoryId, categories.id))
    .where(
      and(
        eq(categories.identifierType, "imei"),
        modelSlug ? eq(deviceModels.slug, modelSlug) : undefined,
      ),
    )
    .orderBy(
      asc(brands.sortOrder),
      desc(deviceModels.releaseYear),
      asc(deviceModels.name),
      asc(modelVariants.storageGb),
      asc(modelVariants.colour),
    );
  if (!variants.length) return [];
  const ids = variants.map((v) => v.variantId);
  const [prices, selling] = await Promise.all([
    db.select().from(tradeInPrices).where(inArray(tradeInPrices.variantId, ids)),
    db
      .select({
        variantId: products.variantId,
        grade: products.grade,
        avg: sql<number>`round(avg(${products.pricePence}))::int`,
      })
      .from(products)
      .where(and(inArray(products.variantId, ids), eq(products.status, "listed")))
      .groupBy(products.variantId, products.grade),
  ]);
  return variants.map((v) => ({
    ...v,
    prices: Object.fromEntries(
      prices.filter((p) => p.variantId === v.variantId).map((p) => [p.grade, p.pricePence]),
    ),
    sellingPence: Object.fromEntries(
      selling.filter((s) => s.variantId === v.variantId).map((s) => [s.grade, s.avg]),
    ),
  }));
}

export const priceChangeSchema = z.object({
  variantId: z.uuid(),
  grade: z.enum(PRICE_GRADES),
  pricePence: z.number().int().min(0).max(MAX_PRICE_PENCE),
});
export type PriceChange = z.infer<typeof priceChangeSchema>;

/** Applies changes (unchanged ones are skipped) and audits each. Returns how many changed. */
export async function updatePrices(
  db: AppDb,
  changes: PriceChange[],
  actor: { staffId: string; source: "table" | "csv" },
  meta?: RequestMeta,
): Promise<number> {
  if (!changes.length) return 0;
  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as AppDb;
    const existing = await tx
      .select()
      .from(tradeInPrices)
      .where(inArray(tradeInPrices.variantId, [...new Set(changes.map((c) => c.variantId))]));
    const current = new Map(existing.map((p) => [`${p.variantId}:${p.grade}`, p.pricePence]));
    let changed = 0;
    for (const change of changes) {
      const key = `${change.variantId}:${change.grade}`;
      const before = current.get(key);
      if (before === change.pricePence) continue;
      await tx
        .insert(tradeInPrices)
        .values({ ...change, updatedBy: actor.staffId })
        .onConflictDoUpdate({
          target: [tradeInPrices.variantId, tradeInPrices.grade],
          set: { pricePence: change.pricePence, updatedBy: actor.staffId, updatedAt: new Date() },
        });
      await recordAudit(
        tx,
        {
          actorType: "staff",
          actorId: actor.staffId,
          action: "price.update",
          entityType: "trade_in_price",
          entityId: key,
          changes: {
            before: { pricePence: before ?? null },
            after: { pricePence: change.pricePence, source: actor.source },
          },
        },
        meta,
      );
      current.set(key, change.pricePence);
      changed++;
    }
    return changed;
  });
}

// CSV ------------------------------------------------------------------------------

export const PRICE_CSV_HEADER = [
  "variant_id",
  "brand",
  "model",
  "storage_gb",
  "colour",
  "grade_a",
  "grade_b",
  "grade_c",
  "faulty",
];
const GRADE_COLUMNS: Record<string, PriceGrade> = {
  grade_a: "A",
  grade_b: "B",
  grade_c: "C",
  faulty: "faulty",
};

const pounds = (pence: number | undefined) => (pence === undefined ? "" : (pence / 100).toFixed(2));

export function pricesToCsv(rows: PriceRow[]): string {
  return toCsv(
    PRICE_CSV_HEADER,
    rows.map((r) => [
      r.variantId,
      r.brand,
      r.model,
      r.storageGb,
      r.colour,
      pounds(r.prices.A),
      pounds(r.prices.B),
      pounds(r.prices.C),
      pounds(r.prices.faulty),
    ]),
  );
}

export type CsvParseResult = {
  changes: PriceChange[];
  errors: { line: number; message: string }[];
};

/**
 * Reads a price CSV (as exported). Only variant_id and the price columns
 * matter; blank prices are left unchanged. Pure: variant ids are checked
 * against the database separately.
 */
export function parsePriceCsv(text: string): CsvParseResult {
  const rows = parseCsv(text);
  const errors: CsvParseResult["errors"] = [];
  const changes: PriceChange[] = [];
  if (!rows.length) return { changes, errors: [{ line: 1, message: "The file is empty." }] };
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const idIndex = header.indexOf("variant_id");
  if (idIndex === -1) {
    return {
      changes,
      errors: [{ line: 1, message: "Missing the variant_id column. Start from an export." }],
    };
  }
  const priceColumns = header.flatMap((h, i) =>
    GRADE_COLUMNS[h] ? [[i, GRADE_COLUMNS[h]!] as const] : [],
  );
  if (!priceColumns.length) {
    return {
      changes,
      errors: [{ line: 1, message: "No price columns (grade_a, grade_b, grade_c, faulty)." }],
    };
  }
  if (rows.length - 1 > 5000) {
    return { changes, errors: [{ line: 1, message: "Up to 5,000 rows per file." }] };
  }
  rows.slice(1).forEach((row, index) => {
    const line = index + 2;
    const variantId = row[idIndex]?.trim() ?? "";
    if (!z.uuid().safeParse(variantId).success) {
      errors.push({ line, message: "variant_id isn’t valid." });
      return;
    }
    for (const [column, grade] of priceColumns) {
      const raw = (row[column] ?? "").trim().replace(/^£/, "").replace(/,/g, "");
      if (raw === "") continue;
      if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
        errors.push({ line, message: `${header[column]} must be a price in pounds, like 120.00.` });
        continue;
      }
      const pence = Math.round(Number(raw) * 100);
      if (pence > MAX_PRICE_PENCE) {
        errors.push({ line, message: `${header[column]} is over £${MAX_PRICE_PENCE / 100}.` });
        continue;
      }
      changes.push({ variantId, grade, pricePence: pence });
    }
  });
  return { changes, errors };
}

export type ImportPreview = {
  errors: { line: number; message: string }[];
  changes: (PriceChange & { label: string; beforePence: number | null })[];
  unchanged: number;
};

/** Checks a CSV against the database and lists what would change. Nothing is saved. */
export async function previewPriceImport(db: AppDb, text: string): Promise<ImportPreview> {
  const parsed = parsePriceCsv(text);
  const ids = [...new Set(parsed.changes.map((c) => c.variantId))];
  if (!ids.length) return { errors: parsed.errors, changes: [], unchanged: 0 };
  const [variants, prices] = await Promise.all([
    db
      .select({
        id: modelVariants.id,
        label: sql<string>`${brands.name} || ' ' || ${deviceModels.name} || ', ' || ${modelVariants.storageGb} || 'GB, ' || ${modelVariants.colour}`,
      })
      .from(modelVariants)
      .innerJoin(deviceModels, eq(modelVariants.modelId, deviceModels.id))
      .innerJoin(brands, eq(deviceModels.brandId, brands.id))
      .innerJoin(categories, eq(deviceModels.categoryId, categories.id))
      .where(and(inArray(modelVariants.id, ids), eq(categories.identifierType, "imei"))),
    db.select().from(tradeInPrices).where(inArray(tradeInPrices.variantId, ids)),
  ]);
  const label = new Map(variants.map((v) => [v.id, v.label]));
  const current = new Map(prices.map((p) => [`${p.variantId}:${p.grade}`, p.pricePence]));
  const errors = [...parsed.errors];
  const unknown = ids.filter((id) => !label.has(id));
  for (const id of unknown) errors.push({ line: 0, message: `Unknown variant ${id}.` });
  let unchanged = 0;
  const changes = parsed.changes.flatMap((c) => {
    if (!label.has(c.variantId)) return [];
    const before = current.get(`${c.variantId}:${c.grade}`) ?? null;
    if (before === c.pricePence) {
      unchanged++;
      return [];
    }
    return [
      {
        ...c,
        label: `${label.get(c.variantId)} · ${c.grade === "faulty" ? "Faulty" : `Grade ${c.grade}`}`,
        beforePence: before,
      },
    ];
  });
  return { errors, changes, unchanged };
}

// History ------------------------------------------------------------------------------

export type PriceHistoryEntry = {
  at: Date;
  staffName: string | null;
  label: string;
  beforePence: number | null;
  afterPence: number;
  source: string;
};

export async function priceHistory(
  db: AppDb,
  options: { variantId?: string; limit?: number } = {},
) {
  const rows = await db
    .select({
      at: auditLog.createdAt,
      staffName: staffUsers.name,
      entityId: auditLog.entityId,
      changes: auditLog.changes,
    })
    .from(auditLog)
    .leftJoin(staffUsers, eq(auditLog.actorId, staffUsers.id))
    .where(
      and(
        eq(auditLog.action, "price.update"),
        options.variantId ? like(auditLog.entityId, `${options.variantId}:%`) : undefined,
      ),
    )
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(options.limit ?? 100);
  const ids = [...new Set(rows.map((r) => r.entityId.split(":")[0]!))].filter(
    (id) => z.uuid().safeParse(id).success,
  );
  const labels = ids.length
    ? await db
        .select({
          id: modelVariants.id,
          label: sql<string>`${brands.name} || ' ' || ${deviceModels.name} || ', ' || ${modelVariants.storageGb} || 'GB, ' || ${modelVariants.colour}`,
        })
        .from(modelVariants)
        .innerJoin(deviceModels, eq(modelVariants.modelId, deviceModels.id))
        .innerJoin(brands, eq(deviceModels.brandId, brands.id))
        .where(inArray(modelVariants.id, ids))
    : [];
  const label = new Map(labels.map((l) => [l.id, l.label]));
  return rows.map((r): PriceHistoryEntry => {
    const [variantId, grade] = r.entityId.split(":");
    const changes = (r.changes ?? {}) as {
      before?: { pricePence?: number | null };
      after?: { pricePence?: number; source?: string };
    };
    return {
      at: r.at,
      staffName: r.staffName,
      label: `${label.get(variantId!) ?? "Unknown variant"} · ${grade === "faulty" ? "Faulty" : `Grade ${grade}`}`,
      beforePence: changes.before?.pricePence ?? null,
      afterPence: changes.after?.pricePence ?? 0,
      source: changes.after?.source ?? "table",
    };
  });
}
