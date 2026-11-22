import { describe, expect, it } from "vitest";

import type { ModelLinkTarget } from "./guides/catalogue";
import type { GuideSummary } from "./guides/types";
import { modelLinks, sellModelPath, shopModelPath } from "./internal-links";

const iphone: ModelLinkTarget = {
  slug: "iphone-15",
  name: "iPhone 15",
  brandSlug: "apple",
  brandName: "Apple",
  categorySlug: "phones",
  maxTradeInPence: 31_500,
  inStock: 5,
  fromPricePence: 37_900,
};

const article: GuideSummary = {
  slug: "iphone-15-vs-16",
  template: "article",
  title: "iPhone 15 or 16?",
  description: "",
  updatedAt: "2026-11-01T00:00:00.000Z",
  model: null,
  relatedModels: ["iphone-15"],
};

describe("model link paths", () => {
  it("builds the sell page and a model-filtered brand listing", () => {
    expect(sellModelPath(iphone)).toBe("/sell/apple/iphone-15");
    expect(shopModelPath(iphone)).toBe("/shop/apple?model=iphone-15");
  });
});

describe("modelLinks", () => {
  it("links sell, shop and every relevant guide for a model we buy and sell", () => {
    const links = modelLinks(iphone, { guides: [article] });
    expect(links.map((l) => l.href)).toEqual([
      "/sell/apple/iphone-15",
      "/shop/apple?model=iphone-15",
      "/guides/how-much-is-my-iphone-15-worth",
      "/guides/iphone-15-vs-16",
      "/guides/how-to-wipe-a-phone",
      "/guides/phone-grading-explained",
    ]);
    expect(links[0]!.detail).toBe("Up to £315");
    expect(links[1]!.detail).toBe("5 in stock from £379.00");
  });

  it("never links to the current page", () => {
    const links = modelLinks(iphone, { exclude: "/sell/apple/iphone-15" });
    expect(links.map((l) => l.href)).not.toContain("/sell/apple/iphone-15");
  });

  it("skips the shop when nothing is in stock, and sell pages when we don't buy it", () => {
    const outOfStock = modelLinks({ ...iphone, inStock: 0, fromPricePence: null });
    expect(outOfStock.map((l) => l.kind)).not.toContain("shop");
    expect(outOfStock.map((l) => l.href)).not.toContain("/guides/phone-grading-explained");

    const saleOnly = modelLinks({ ...iphone, maxTradeInPence: null });
    expect(saleOnly.map((l) => l.href)).toEqual([
      "/shop/apple?model=iphone-15",
      "/guides/phone-grading-explained",
    ]);
  });

  it("ignores guides about other models", () => {
    const links = modelLinks(iphone, { guides: [{ ...article, relatedModels: ["pixel-9"] }] });
    expect(links.map((l) => l.href)).not.toContain("/guides/iphone-15-vs-16");
  });
});
