// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { customers, reviews } from "@/db/schema";
import { seed } from "@/db/seed";
import { sampleTradeInPence } from "@/db/seed/catalogue";
import type { AppDb } from "@/db/types";
import {
  getFeaturedProducts,
  getPublishedReviews,
  getQuoteStats,
  modelSearchQuerySchema,
  searchModels,
} from "@/lib/catalogue/home-data";
import { createTestDb } from "@/test/db";

let db: AppDb;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seed(db);
}, 60_000);
afterAll(() => close?.());

describe("searchModels", () => {
  it("matches every word against brand and model, newest first", async () => {
    const results = await searchModels(db, "iphone");
    expect(results.map((r) => r.name)).toEqual([
      "iPhone 17 Pro",
      "iPhone 16",
      "iPhone 15",
      "iPhone 13",
    ]);
    expect((await searchModels(db, "samsung s24")).map((r) => r.slug)).toEqual(["galaxy-s24"]);
    expect((await searchModels(db, "PIXEL 9")).map((r) => r.slug)).toEqual(["pixel-9"]);
  });

  it("returns the top trade-in price, calculated in the database", async () => {
    const [iphone15] = await searchModels(db, "iphone 15");
    // Grade A, largest storage (index 2 of 128/256/512).
    expect(iphone15!.maxPricePence).toBe(sampleTradeInPence(26000, 2, "A"));
  });

  it("treats LIKE wildcards as plain text", async () => {
    expect(await searchModels(db, "%")).toEqual([]);
    expect(await searchModels(db, "_")).toEqual([]);
  });

  it("returns nothing for unknown phones", async () => {
    expect(await searchModels(db, "nokia 3310")).toEqual([]);
  });
});

describe("modelSearchQuerySchema", () => {
  it("trims and collapses spaces, and limits length", () => {
    expect(modelSearchQuerySchema.parse("  iPhone   15 ")).toBe("iPhone 15");
    expect(modelSearchQuerySchema.safeParse("i").success).toBe(false);
    expect(modelSearchQuerySchema.safeParse("x".repeat(61)).success).toBe(false);
  });
});

describe("home page data", () => {
  it("counts priced models and stores and finds the top price", async () => {
    const stats = await getQuoteStats(db);
    expect(stats).toEqual({
      models: 10,
      stores: 3,
      maxTradeInPence: sampleTradeInPence(62000, 2, "A"),
    });
  });

  it("lists featured refurbished phones, newest first", async () => {
    const featured = await getFeaturedProducts(db);
    expect(featured).toHaveLength(6);
    expect(featured[0]).toMatchObject({
      brand: "Apple",
      model: "iPhone 15",
      storageGb: 128,
      colour: "Black",
      grade: "A",
      pricePence: 46900,
    });
  });

  it("only shows published reviews", async () => {
    const [customer] = await db.insert(customers).values({ email: "r@example.com" }).returning();
    await db.insert(reviews).values([
      {
        customerId: customer!.id,
        displayName: "Sam",
        rating: 5,
        body: "Great",
        status: "published",
        publishedAt: new Date(),
      },
      { customerId: customer!.id, displayName: "Alex", rating: 1, body: "Spam", status: "pending" },
    ]);
    const published = await getPublishedReviews(db);
    expect(published.map((r) => r.displayName)).toEqual(["Sam"]);
    await db.delete(reviews).where(eq(reviews.customerId, customer!.id));
  });
});
