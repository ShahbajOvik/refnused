// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { products, stockAlerts } from "@/db/schema";
import { seed } from "@/db/seed";
import { sampleTradeInPence, seedModels, seedProducts } from "@/db/seed/catalogue";
import type { AppDb } from "@/db/types";
import { createTestDb } from "@/test/db";

import {
  estimateTradeIn,
  getCompareProducts,
  getProductDetail,
  getShopFacets,
  getSimilarProducts,
  getStockByStore,
  listProductParams,
  listTradeInModels,
  searchProducts,
} from "./catalogue";
import { EMPTY_FILTERS, parseShopFilters, type ShopFilters } from "./filters";
import {
  createStockAlert,
  getStockAlertByToken,
  stockAlertSchema,
  unsubscribeStockAlert,
} from "./stock-alerts";

let db: AppDb;
let close: () => Promise<void>;

const LISTED = seedProducts.filter((p) => (p.status ?? "listed") === "listed");
const filters = (raw: Record<string, string>): ShopFilters => parseShopFilters(raw);

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seed(db);
});
afterAll(() => close?.());

describe("searchProducts", () => {
  it("lists only units for sale, newest first", async () => {
    const result = await searchProducts(db, EMPTY_FILTERS, 100);
    expect(result.total).toBe(LISTED.length);
    expect(result.items.every((p) => p.status === "listed")).toBe(true);
    expect(result.items.map((p) => p.slug)).not.toContain("iphone-15-128gb-yellow-y8c5gn");
    const listedAt = result.items.map((p) => p.listedAt!.getTime());
    expect(listedAt).toEqual([...listedAt].sort((a, b) => b - a));
  });

  it("filters by brand, grade, storage, colour, store, price and battery together", async () => {
    const result = await searchProducts(
      db,
      filters({
        brand: "apple",
        grade: "A,B",
        storage: "128,256",
        colour: "black,blue",
        store: "fairtech-south-shields",
        min: "400",
        max: "600",
        battery: "90",
      }),
    );
    const expected = LISTED.filter(
      (p) =>
        p.model.startsWith("iphone") &&
        ["A", "B"].includes(p.grade) &&
        [128, 256].includes(p.storageGb) &&
        ["Black", "Blue"].includes(p.colour) &&
        p.storeSlug === "fairtech-south-shields" &&
        p.pricePence >= 40000 &&
        p.pricePence <= 60000 &&
        p.batteryHealthPercent >= 90,
    );
    expect(expected.length).toBeGreaterThan(1);
    expect(result.items.map((p) => p.slug).sort()).toEqual(
      expected.map((p) => expect.stringContaining(p.slugSuffix)).sort(),
    );
    expect(result.total).toBe(expected.length);
  });

  it("matches colours by slug, including punctuation", async () => {
    const result = await searchProducts(db, filters({ colour: "product-red" }));
    expect(result.items.map((p) => p.colour)).toEqual(["(PRODUCT)RED"]);
  });

  it("filters by model", async () => {
    const result = await searchProducts(db, filters({ model: "iphone-15" }));
    expect(result.total).toBe(LISTED.filter((p) => p.model === "iphone-15").length);
  });

  it.each([
    ["price-asc", (a: number, b: number) => a - b, "pricePence"],
    ["price-desc", (a: number, b: number) => b - a, "pricePence"],
    ["battery-desc", (a: number, b: number) => b - a, "batteryHealthPercent"],
  ] as const)("sorts by %s", async (sort, compare, key) => {
    const { items } = await searchProducts(db, filters({ sort }), 100);
    const values = items.map((p) => p[key]);
    expect(values).toEqual([...values].sort(compare));
  });

  it("paginates without overlaps or gaps", async () => {
    const pageSize = 5;
    const seen: string[] = [];
    const first = await searchProducts(db, filters({ sort: "price-asc" }), pageSize);
    expect(first.pageCount).toBe(Math.ceil(LISTED.length / pageSize));
    for (let page = 1; page <= first.pageCount; page++) {
      const { items } = await searchProducts(
        db,
        filters({ sort: "price-asc", page: String(page) }),
        pageSize,
      );
      seen.push(...items.map((p) => p.id));
    }
    expect(seen).toHaveLength(LISTED.length);
    expect(new Set(seen).size).toBe(LISTED.length);
  });

  it("returns an empty page past the end", async () => {
    const result = await searchProducts(db, filters({ page: "99" }));
    expect(result.items).toEqual([]);
    expect(result.total).toBe(LISTED.length);
  });
});

describe("getShopFacets", () => {
  it("counts each facet with the other filters applied", async () => {
    const facets = await getShopFacets(db, filters({ brand: "apple", grade: "A" }));
    const count = (list: { value: string; count: number }[], value: string) =>
      list.find((o) => o.value === value)?.count ?? 0;

    // Brand counts ignore the brand filter but respect grade A.
    expect(count(facets.brands, "samsung")).toBe(
      LISTED.filter((p) => p.model.startsWith("galaxy") && p.grade === "A").length,
    );
    // Grade counts ignore the grade filter but respect brand=apple.
    expect(count(facets.grades, "B")).toBe(
      LISTED.filter((p) => p.model.startsWith("iphone") && p.grade === "B").length,
    );
    // Every grade is offered, even with no stock.
    expect(facets.grades.map((g) => g.value)).toEqual(["A", "B", "C"]);
    expect(facets.price!.minPence).toBeLessThanOrEqual(facets.price!.maxPence);
  });

  it("counts battery thresholds cumulatively", async () => {
    const { battery } = await getShopFacets(db, EMPTY_FILTERS);
    const at = (t: number) => battery.find((b) => b.value === String(t))!.count;
    expect(at(80)).toBe(LISTED.filter((p) => p.batteryHealthPercent >= 80).length);
    expect(at(95)).toBe(LISTED.filter((p) => p.batteryHealthPercent >= 95).length);
    expect(at(80)).toBeGreaterThanOrEqual(at(95));
  });

  it("labels colours and stores", async () => {
    const facets = await getShopFacets(db, EMPTY_FILTERS);
    expect(facets.colours.find((c) => c.value === "cobalt-violet")).toMatchObject({
      label: "Cobalt Violet",
      hex: "#6c5b9b",
    });
    expect(facets.stores.map((s) => s.label)).toContain("FairTech, South Shields");
    expect(facets.models.find((m) => m.value === "pixel-9")?.group).toBe("Google");
  });
});

describe("product pages", () => {
  it("loads a listed unit with photos and its store", async () => {
    const detail = await getProductDetail(db, "apple", "iphone-15-128gb-black-k3x9q2");
    expect(detail).toMatchObject({
      model: "iPhone 15",
      grade: "A",
      pricePence: 46900,
      status: "listed",
      store: { name: "MetroTech", postcode: "NE29 6RR" },
    });
    expect(detail!.photos.length).toBeGreaterThan(0);
  });

  it("keeps sold units, but not under the wrong brand or when withdrawn", async () => {
    expect((await getProductDetail(db, "apple", "iphone-15-128gb-yellow-y8c5gn"))?.status).toBe(
      "sold",
    );
    expect(await getProductDetail(db, "samsung", "iphone-15-128gb-black-k3x9q2")).toBeNull();

    const [unit] = await db
      .update(products)
      .set({ status: "withdrawn" })
      .where(eq(products.slug, "galaxy-a55-128gb-awesome-navy-w4f7yh"))
      .returning();
    expect(await getProductDetail(db, "samsung", unit!.slug)).toBeNull();
    await db.update(products).set({ status: "listed" }).where(eq(products.id, unit!.id));
  });

  it("only prerenders units for sale", async () => {
    const params = await listProductParams(db);
    expect(params).toHaveLength(LISTED.length);
    expect(params).toContainEqual({ brand: "apple", slug: "iphone-15-128gb-black-k3x9q2" });
  });

  it("counts stock per store for the model and exact variant", async () => {
    const detail = (await getProductDetail(db, "apple", "iphone-15-128gb-black-k3x9q2"))!;
    const stock = await getStockByStore(db, detail);
    const iphone15 = LISTED.filter((p) => p.model === "iphone-15");
    expect(stock.reduce((sum, s) => sum + s.modelCount, 0)).toBe(iphone15.length);
    expect(stock.reduce((sum, s) => sum + s.variantCount, 0)).toBe(
      iphone15.filter((p) => p.storageGb === 128 && p.colour === "Black").length,
    );
    expect(stock.map((s) => `${s.storeName}, ${s.storeTown}`)).toEqual([
      "FairTech, North Shields",
      "FairTech, South Shields",
      "MetroTech, North Shields",
    ]);
  });

  it("suggests the same model first and never the unit itself", async () => {
    const detail = (await getProductDetail(db, "apple", "iphone-15-128gb-black-k3x9q2"))!;
    const similar = await getSimilarProducts(db, { ...detail, excludeId: detail.id });
    expect(similar).toHaveLength(4);
    expect(similar.map((p) => p.id)).not.toContain(detail.id);
    expect(similar[0]!.model).toBe("iPhone 15");
    expect(similar.every((p) => p.status === "listed")).toBe(true);
  });

  it("returns compare items in the order asked, skipping unknown slugs", async () => {
    const items = await getCompareProducts(db, [
      "pixel-9-128gb-obsidian-p2h8vd",
      "nope-1",
      "iphone-15-128gb-black-k3x9q2",
    ]);
    expect(items.map((p) => p.model)).toEqual(["Pixel 9", "iPhone 15"]);
  });
});

describe("estimateTradeIn", () => {
  it("takes the best price for that model, storage and condition off the unit's price", async () => {
    const detail = (await getProductDetail(db, "apple", "iphone-16-128gb-ultramarine-t9b6xe"))!;
    const estimate = await estimateTradeIn(db, {
      productId: detail.id,
      modelSlug: "iphone-13",
      storageGb: 256,
      condition: "good",
    });
    const iphone13 = seedModels.find((m) => m.slug === "iphone-13")!;
    const tradeIn = sampleTradeInPence(iphone13.baseTradeInPence, 1, "B");
    expect(estimate).toEqual({
      ok: true,
      productPricePence: 59900,
      tradeInModel: "iPhone 13",
      sellPath: "/sell/apple/iphone-13",
      saving: { tradeInPence: tradeIn, payPence: 59900 - tradeIn, cashBackPence: 0 },
    });
  });

  it("refuses sold units and unknown storage", async () => {
    const sold = (await getProductDetail(db, "apple", "iphone-15-128gb-yellow-y8c5gn"))!;
    expect(
      await estimateTradeIn(db, {
        productId: sold.id,
        modelSlug: "iphone-13",
        storageGb: 128,
        condition: "good",
      }),
    ).toEqual({ ok: false, reason: "product_unavailable" });

    const listed = (await getProductDetail(db, "apple", "iphone-15-128gb-black-k3x9q2"))!;
    expect(
      await estimateTradeIn(db, {
        productId: listed.id,
        modelSlug: "iphone-13",
        storageGb: 64,
        condition: "good",
      }),
    ).toEqual({ ok: false, reason: "no_price" });
  });

  it("lists models with their storage sizes", async () => {
    const models = await listTradeInModels(db);
    expect(models).toHaveLength(seedModels.length);
    expect(models.find((m) => m.slug === "iphone-17-pro")?.storage).toEqual([256, 512, 1024]);
  });
});

describe("stock alerts", () => {
  const input = (email: string, scope: "model" | "storage" = "storage") =>
    stockAlertSchema.parse({ productId: soldId, email, scope, consent: true });
  let soldId: string;

  beforeAll(async () => {
    soldId = (await getProductDetail(db, "apple", "iphone-15-128gb-yellow-y8c5gn"))!.id;
  });

  it("validates input", () => {
    expect(
      stockAlertSchema.safeParse({ productId: soldId, email: "x", scope: "model", consent: true })
        .success,
    ).toBe(false);
    expect(
      stockAlertSchema.safeParse({
        productId: soldId,
        email: "a@example.com",
        scope: "model",
        consent: false,
      }).success,
    ).toBe(false);
    expect(input("  Jo@Example.CO.UK ").email).toBe("jo@example.co.uk");
  });

  it("creates one alert per email, model and storage, and stores only a token hash", async () => {
    const first = await createStockAlert(db, input("jo@example.co.uk"));
    expect(first).toMatchObject({ ok: true, created: true, storageGb: 128 });
    const again = await createStockAlert(db, input("JO@example.co.uk".toLowerCase()));
    expect(again).toMatchObject({ ok: true, created: false, unsubscribeToken: undefined });
    const anyStorage = await createStockAlert(db, input("jo@example.co.uk", "model"));
    expect(anyStorage).toMatchObject({ created: true, storageGb: null });

    const rows = await db
      .select()
      .from(stockAlerts)
      .where(eq(stockAlerts.email, "jo@example.co.uk"));
    expect(rows).toHaveLength(2);
    if (!first.ok) throw new Error("unreachable");
    expect(rows.map((r) => r.unsubscribeTokenHash)).not.toContain(first.unsubscribeToken);
  });

  it("unsubscribes with the token, once, and allows signing up again", async () => {
    const created = await createStockAlert(db, input("sam@example.co.uk"));
    if (!created.ok || !created.unsubscribeToken) throw new Error("expected a new alert");
    const token = created.unsubscribeToken;
    expect(await getStockAlertByToken(db, token)).toMatchObject({
      isActive: true,
      modelName: "iPhone 15",
    });
    expect(await unsubscribeStockAlert(db, token)).toBe(true);
    expect(await unsubscribeStockAlert(db, token)).toBe(false);
    expect(await unsubscribeStockAlert(db, "not a token")).toBe(false);
    expect((await createStockAlert(db, input("sam@example.co.uk"))).ok).toBe(true);
  });

  it("rejects unknown products", async () => {
    expect(
      await createStockAlert(
        db,
        stockAlertSchema.parse({
          productId: "00000000-0000-4000-8000-000000000000",
          email: "a@example.com",
          scope: "model",
          consent: true,
        }),
      ),
    ).toEqual({ ok: false, reason: "unknown_product" });
  });
});
