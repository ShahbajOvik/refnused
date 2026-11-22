import { describe, expect, it } from "vitest";

import { DEFAULT_OG_IMAGE, metaDescription, pageMetadata, privateMetadata } from "@/lib/metadata";
import {
  guideMetadata,
  productMetadata,
  sellModelMetadata,
  storeMetadata,
} from "@/lib/metadata-templates";
import type { Guide } from "@refnused/database/lib/guides/types";
import { stores } from "@refnused/database/config/site";

describe("pageMetadata", () => {
  const meta = pageMetadata({ title: "Sell your phone", description: "Quotes.", path: "/sell" });

  it("sets a canonical and points en-GB and x-default hreflang at the same URL", () => {
    expect(meta.alternates).toEqual({
      canonical: "/sell",
      languages: { "en-GB": "/sell", "x-default": "/sell" },
    });
  });

  it("fills Open Graph and Twitter with the full title and the site-wide image", () => {
    expect(meta.openGraph).toMatchObject({
      type: "website",
      title: "Sell your phone | RefurbednUsed",
      description: "Quotes.",
      url: "/sell",
      locale: "en_GB",
      siteName: "RefurbednUsed",
      images: [DEFAULT_OG_IMAGE],
    });
    expect(meta.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it("leaves robots out of indexable pages", () => {
    expect(meta).not.toHaveProperty("robots");
  });

  it("noindexes but follows filtered pages", () => {
    const filtered = pageMetadata({
      title: "x",
      description: "y",
      path: "/shop?grade=A",
      noindex: true,
    });
    expect(filtered.robots).toEqual({ index: false, follow: true });
    expect(filtered.alternates?.canonical).toBe("/shop?grade=A");
  });

  it("leaves images out when the route has its own opengraph-image file", () => {
    const withFile = pageMetadata({ title: "x", description: "y", path: "/x", image: "file" });
    expect(withFile.openGraph).not.toHaveProperty("images");
  });

  it("supports absolute titles", () => {
    const home = pageMetadata({ title: "Home", absoluteTitle: true, description: "d", path: "/" });
    expect(home.title).toEqual({ absolute: "Home" });
    expect(home.openGraph?.title).toBe("Home");
  });

  it("adds article dates and authors", () => {
    const article = pageMetadata({
      title: "Guide",
      description: "d",
      path: "/guides/x",
      type: "article",
      article: {
        publishedTime: "2026-01-01T00:00:00.000Z",
        modifiedTime: "2026-02-01T00:00:00.000Z",
        authors: ["Sam"],
      },
    });
    expect(article.openGraph).toMatchObject({
      type: "article",
      publishedTime: "2026-01-01T00:00:00.000Z",
      modifiedTime: "2026-02-01T00:00:00.000Z",
      authors: ["Sam"],
    });
  });
});

describe("privateMetadata", () => {
  it("is noindex, nofollow with no canonical or social tags", () => {
    const meta = privateMetadata("Your basket");
    expect(meta).toEqual({ title: "Your basket", robots: { index: false, follow: false } });
    expect(privateMetadata("Track", { nocache: true }).robots).toMatchObject({ nocache: true });
  });
});

describe("metaDescription", () => {
  it("keeps short text and collapses whitespace", () => {
    expect(metaDescription("  Hello\n  there ")).toBe("Hello there");
  });

  it("cuts long text at a word boundary with an ellipsis", () => {
    const long = "word ".repeat(60);
    const out = metaDescription(long);
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.endsWith("word…")).toBe(true);
  });
});

describe("page-type templates", () => {
  it("sell model pages use the live top price and their own OG image", () => {
    const meta = sellModelMetadata(
      {
        slug: "iphone-15",
        name: "iPhone 15",
        brandSlug: "apple",
        brandName: "Apple",
        maxPricePence: 31_500,
      },
      14,
    );
    expect(meta.title).toBe("Sell your Apple iPhone 15");
    expect(meta.description).toContain("Get up to £315.");
    expect(meta.description).toContain("Price locked for 14 days");
    expect(meta.alternates?.canonical).toBe("/sell/apple/iphone-15");
    expect(meta.openGraph).not.toHaveProperty("images");
  });

  it("product pages flag sold units in the title", () => {
    const meta = productMetadata({
      brand: "Apple",
      brandSlug: "apple",
      model: "iPhone 15",
      slug: "iphone-15-128gb-black-k3x9q2",
      storageGb: 128,
      colour: "Black",
      grade: "A",
      status: "sold",
      batteryHealthPercent: 96,
      warrantyMonths: 12,
      pricePence: 46_900,
    });
    expect(meta.title).toBe("Apple iPhone 15, 128GB, Black, Grade A refurbished (Sold)");
    expect(meta.description).toContain("battery health 96%");
    expect(meta.description).toContain("£469.00");
    expect(meta.alternates?.canonical).toBe("/shop/apple/iphone-15-128gb-black-k3x9q2");
  });

  it("store pages use the NAP helpers", () => {
    const store = {
      ...stores[0]!,
      email: null,
      openingHours: null,
      latitude: null,
      longitude: null,
      parkingInfo: null,
      nearestMetro: null,
      photos: [],
    };
    const meta = storeMetadata(store);
    expect(meta.title).toBe(
      "MetroTech, North Shields: phone shop, trade-ins and refurbished phones",
    );
    expect(meta.description).toContain("77A Rudyerd Street, North Shields NE29 6RR");
    expect(String(meta.description).length).toBeLessThanOrEqual(160);
  });

  it("guides are articles with dates and author", () => {
    const guide: Guide = {
      slug: "how-to-wipe-a-phone",
      template: "wipe",
      title: "How to wipe a phone",
      description: "Steps.",
      author: { kind: "person", name: "Sam Lee", role: null },
      publishedAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-10T00:00:00.000Z",
      image: null,
      body: null,
      relatedModels: [],
      model: null,
    };
    const meta = guideMetadata(guide);
    expect(meta.alternates?.canonical).toBe("/guides/how-to-wipe-a-phone");
    expect(meta.openGraph).toMatchObject({ type: "article", authors: ["Sam Lee"] });
  });
});
