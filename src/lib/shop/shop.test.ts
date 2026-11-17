import { describe, expect, it } from "vitest";

import { RETURN_POLICY } from "@/config/shop";

import {
  EMPTY_FILTERS,
  isIndexableListing,
  parseShopFilters,
  serializeShopFilters,
  shopHref,
  withFilters,
  withoutValue,
} from "./filters";
import { penceToDecimal, productJsonLd, type ProductJsonLdInput } from "./json-ld";
import { batteryRating, tradeInSaving } from "./product-info";
import { productSlug, slugify } from "./slug";

describe("slugify / productSlug", () => {
  it("makes URL-safe slugs from colour names", () => {
    expect(slugify("Cobalt Violet")).toBe("cobalt-violet");
    expect(slugify("(PRODUCT)RED")).toBe("product-red");
    expect(slugify("  Crème  ")).toBe("creme");
  });

  it("builds unit slugs with a suffix", () => {
    expect(
      productSlug({ modelSlug: "iphone-15", storageGb: 128, colour: "Black", suffix: "k3x9q2" }),
    ).toBe("iphone-15-128gb-black-k3x9q2");
    expect(productSlug({ modelSlug: "pixel-9", storageGb: 256, colour: "Obsidian" })).toMatch(
      /^pixel-9-256gb-obsidian-[a-z2-9]{6}$/,
    );
  });
});

describe("parseShopFilters", () => {
  it("returns defaults for an empty query", () => {
    expect(parseShopFilters({})).toEqual(EMPTY_FILTERS);
  });

  it("accepts comma lists and repeated keys, deduplicated and sorted", () => {
    const filters = parseShopFilters({
      brand: ["samsung", "apple,samsung"],
      storage: "256,128",
      grade: "B,A",
    });
    expect(filters.brands).toEqual(["apple", "samsung"]);
    expect(filters.storage).toEqual([128, 256]);
    expect(filters.grades).toEqual(["A", "B"]);
  });

  it("reads URLSearchParams from a submitted form", () => {
    const params = new URLSearchParams("brand=apple&brand=google&min=&max=400&sort=price-asc");
    const filters = parseShopFilters(params);
    expect(filters.brands).toEqual(["apple", "google"]);
    expect(filters.minPrice).toBeUndefined();
    expect(filters.maxPrice).toBe(400);
    expect(filters.sort).toBe("price-asc");
  });

  it("drops malformed values instead of failing", () => {
    const filters = parseShopFilters({
      brand: "Apple!,../etc",
      grade: "D,a",
      storage: "-1,abc,1.5",
      battery: "77",
      sort: "cheapest",
      page: "0",
      min: "-5",
    });
    expect(filters).toEqual(EMPTY_FILTERS);
  });

  it("swaps a reversed price range and treats £0 minimum as none", () => {
    expect(parseShopFilters({ min: "500", max: "200" })).toMatchObject({
      minPrice: 200,
      maxPrice: 500,
    });
    expect(parseShopFilters({ min: "0" }).minPrice).toBeUndefined();
  });

  it("only accepts listed battery thresholds", () => {
    expect(parseShopFilters({ battery: "90" }).minBattery).toBe(90);
    expect(parseShopFilters({ battery: "91" }).minBattery).toBeUndefined();
  });

  it("caps the number of values per facet", () => {
    const many = Array.from({ length: 50 }, (_, i) => `model-${i}`).join(",");
    expect(parseShopFilters({ model: many }).models).toHaveLength(20);
  });
});

describe("serializeShopFilters", () => {
  it("is canonical and round-trips", () => {
    const filters = parseShopFilters({
      sort: "price-asc",
      brand: "samsung,apple",
      colour: "black",
      page: "2",
      battery: "85",
    });
    const query = serializeShopFilters(filters);
    expect(query).toBe("brand=apple,samsung&colour=black&battery=85&sort=price-asc&page=2");
    expect(parseShopFilters(new URLSearchParams(query))).toEqual(filters);
  });

  it("leaves out defaults", () => {
    expect(shopHref(EMPTY_FILTERS)).toBe("/shop");
    expect(shopHref(EMPTY_FILTERS, "/shop/apple")).toBe("/shop/apple");
  });

  it("goes back to page 1 when filters change", () => {
    const onPage3 = { ...EMPTY_FILTERS, page: 3, grades: ["A" as const, "B" as const] };
    expect(withFilters(onPage3, { sort: "price-desc" }).page).toBe(1);
    expect(withoutValue(onPage3, "grades", "A")).toMatchObject({ grades: ["B"], page: 1 });
  });
});

describe("isIndexableListing", () => {
  it("indexes only the plain first page", () => {
    expect(isIndexableListing(EMPTY_FILTERS)).toBe(true);
    expect(isIndexableListing({ ...EMPTY_FILTERS, page: 2 })).toBe(false);
    expect(isIndexableListing({ ...EMPTY_FILTERS, sort: "price-asc" })).toBe(false);
    expect(isIndexableListing({ ...EMPTY_FILTERS, minBattery: 90 })).toBe(false);
  });
});

describe("batteryRating", () => {
  it.each([
    [100, "Like new"],
    [95, "Like new"],
    [94, "Excellent"],
    [90, "Excellent"],
    [89, "Very good"],
    [85, "Very good"],
    [84, "Good"],
    [80, "Good"],
    [79, "Reduced"],
    [0, "Reduced"],
  ])("%i%% is %s", (percent, label) => {
    expect(batteryRating(percent).label).toBe(label);
  });

  it("rejects impossible values", () => {
    expect(() => batteryRating(101)).toThrow(RangeError);
    expect(() => batteryRating(-1)).toThrow(RangeError);
    expect(() => batteryRating(90.5)).toThrow(RangeError);
  });
});

describe("tradeInSaving", () => {
  it("subtracts the trade-in from the price", () => {
    expect(tradeInSaving(46900, 22000)).toEqual({
      tradeInPence: 22000,
      payPence: 24900,
      cashBackPence: 0,
    });
  });

  it("never goes below zero and reports the difference as cash back", () => {
    expect(tradeInSaving(15900, 26000)).toEqual({
      tradeInPence: 26000,
      payPence: 0,
      cashBackPence: 10100,
    });
    expect(tradeInSaving(20000, 20000)).toMatchObject({ payPence: 0, cashBackPence: 0 });
  });

  it("rejects floats and negatives", () => {
    expect(() => tradeInSaving(100.5, 0)).toThrow(RangeError);
    expect(() => tradeInSaving(100, -1)).toThrow(RangeError);
  });
});

describe("productJsonLd", () => {
  const input: ProductJsonLdInput = {
    path: "/shop/apple/iphone-15-128gb-black-k3x9q2",
    sku: "iphone-15-128gb-black-k3x9q2",
    brand: "Apple",
    model: "iPhone 15",
    storageGb: 128,
    colour: "Black",
    grade: "A",
    batteryHealthPercent: 96,
    warrantyMonths: 12,
    pricePence: 46900,
    availability: "in_stock",
    images: ["/media/sample/phone-front.webp"],
    store: { slug: "metrotech-north-shields", name: "MetroTech" },
  };

  it("formats pence as a decimal string", () => {
    expect(penceToDecimal(46900)).toBe("469.00");
    expect(penceToDecimal(599)).toBe("5.99");
    expect(penceToDecimal(5)).toBe("0.05");
    expect(penceToDecimal(0)).toBe("0.00");
    expect(() => penceToDecimal(1.5)).toThrow(TypeError);
  });

  it("describes a refurbished unit with a GBP offer", () => {
    const data = productJsonLd(input);
    expect(data["@type"]).toBe("Product");
    expect(data.itemCondition).toBe("https://schema.org/RefurbishedCondition");
    expect(data.image).toEqual(["http://localhost:3000/media/sample/phone-front.webp"]);
    expect(data.offers).toMatchObject({
      "@type": "Offer",
      price: "469.00",
      priceCurrency: "GBP",
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/RefurbishedCondition",
      url: "http://localhost:3000/shop/apple/iphone-15-128gb-black-k3x9q2",
    });
  });

  it("includes the return policy and UK shipping", () => {
    const { offers } = productJsonLd(input);
    expect(offers.hasMerchantReturnPolicy).toMatchObject({
      "@type": "MerchantReturnPolicy",
      applicableCountry: "GB",
      merchantReturnDays: RETURN_POLICY.days,
      returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    });
    expect(offers.shippingDetails.length).toBeGreaterThan(0);
    for (const shipping of offers.shippingDetails) {
      expect(shipping.shippingRate.currency).toBe("GBP");
      expect(shipping.shippingDestination.addressCountry).toBe("GB");
      expect(shipping.deliveryTime.transitTime.unitCode).toBe("DAY");
    }
  });

  it("marks sold and reserved units", () => {
    expect(productJsonLd({ ...input, availability: "sold" }).offers.availability).toBe(
      "https://schema.org/SoldOut",
    );
    expect(productJsonLd({ ...input, availability: "reserved" }).offers.availability).toBe(
      "https://schema.org/Reserved",
    );
  });
});
