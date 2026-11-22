// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { categories, deviceModels } from "../../db/schema";
import { seed } from "../../db/seed";
import { sampleTradeInPence } from "../../db/seed/catalogue";
import type { AppDb } from "../../db/types";
import { createTestDb } from "../../test/db";

import { getModelLinkTargets, getModelValueData, listTradeInModels } from "./catalogue";
import { buildModelValueTable } from "./model-value";

let db: AppDb;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seed(db);
});
afterAll(() => close?.());

describe("listTradeInModels", () => {
  it("lists every model we buy with its top price, by brand order", async () => {
    const models = await listTradeInModels(db);
    expect(models.map((m) => m.brandSlug)).toEqual(
      [...models.map((m) => m.brandSlug)].sort(
        (a, b) =>
          ["apple", "samsung", "google"].indexOf(a) - ["apple", "samsung", "google"].indexOf(b),
      ),
    );
    const iphone = models.find((m) => m.slug === "iphone-15")!;
    expect(iphone.maxPricePence).toBe(sampleTradeInPence(26000, 2, "A"));
    expect(iphone.pricesUpdatedAt).toBeInstanceOf(Date);
  });
});

describe("getModelValueData", () => {
  it("returns every storage and grade price for the live table", async () => {
    const data = (await getModelValueData(db, "iphone-15"))!;
    expect(data.model).toMatchObject({ name: "iPhone 15", brandName: "Apple", brandSlug: "apple" });
    const table = buildModelValueTable(data.prices);
    expect(table.rows.map((r) => r.storageGb)).toEqual([128, 256, 512]);
    expect(table.grades).toEqual(["A", "B", "C", "faulty"]);
    expect(table.rows[0]!.prices.B).toBe(sampleTradeInPence(26000, 0, "B"));
    expect(table.top).toEqual({
      pricePence: sampleTradeInPence(26000, 2, "A"),
      storageGb: 512,
      grade: "A",
    });
  });

  it("returns null for unknown or inactive models", async () => {
    expect(await getModelValueData(db, "nokia-3310")).toBeNull();
    await db.update(deviceModels).set({ isActive: false }).where(eq(deviceModels.slug, "pixel-8a"));
    expect(await getModelValueData(db, "pixel-8a")).toBeNull();
    await db.update(deviceModels).set({ isActive: true }).where(eq(deviceModels.slug, "pixel-8a"));
  });
});

describe("getModelLinkTargets", () => {
  it("reports trade-in price and listed stock, in the caller's order", async () => {
    const targets = await getModelLinkTargets(db, ["iphone-15", "galaxy-s24", "unknown"]);
    expect(targets.map((t) => t.slug)).toEqual(["iphone-15", "galaxy-s24"]);
    const iphone = targets[0]!;
    expect(iphone.maxTradeInPence).toBe(sampleTradeInPence(26000, 2, "A"));
    // Seeded listed units: 469, 429, 519, 379, 559 (sold and reserved units don't count).
    expect(iphone.inStock).toBe(5);
    expect(iphone.fromPricePence).toBe(37_900);
  });

  it("has no trade-in price for categories we don't buy", async () => {
    const [phones] = await db.select().from(categories).where(eq(categories.slug, "phones"));
    await db
      .update(categories)
      .set({ identifierType: "serial" })
      .where(eq(categories.id, phones!.id));
    try {
      const [iphone] = await getModelLinkTargets(db, ["iphone-15"]);
      expect(iphone!.maxTradeInPence).toBeNull();
      expect(iphone!.inStock).toBe(5);
    } finally {
      await db
        .update(categories)
        .set({ identifierType: "imei" })
        .where(eq(categories.id, phones!.id));
    }
  });

  it("returns nothing for an empty list", async () => {
    expect(await getModelLinkTargets(db, [])).toEqual([]);
  });
});
