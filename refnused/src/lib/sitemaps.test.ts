import { describe, expect, it } from "vitest";

import { SITEMAPS, sitemapEntry, sitemapIndexXml, sitemapPath } from "@/lib/sitemaps";

describe("sitemapEntry", () => {
  it("makes absolute URLs with en-GB and x-default alternates", () => {
    const entry = sitemapEntry("/sell/apple/iphone-15", {
      lastModified: "2026-11-01T10:00:00.000Z",
      changeFrequency: "weekly",
      priority: 0.8,
      images: ["/media/products/a.webp"],
    });
    expect(entry).toEqual({
      url: "http://localhost:3000/sell/apple/iphone-15",
      lastModified: new Date("2026-11-01T10:00:00.000Z"),
      changeFrequency: "weekly",
      priority: 0.8,
      images: ["http://localhost:3000/media/products/a.webp"],
      alternates: {
        languages: {
          "en-GB": "http://localhost:3000/sell/apple/iphone-15",
          "x-default": "http://localhost:3000/sell/apple/iphone-15",
        },
      },
    });
  });

  it("leaves out empty optional fields", () => {
    const entry = sitemapEntry("/", { lastModified: null, images: [] });
    expect(entry).not.toHaveProperty("lastModified");
    expect(entry).not.toHaveProperty("images");
  });
});

describe("sitemapIndexXml", () => {
  it("lists the split sitemaps", () => {
    expect(SITEMAPS).toEqual(["pages", "models", "products", "stores", "guides"]);
    const xml = sitemapIndexXml(
      SITEMAPS.map((name) => ({ url: `https://example.com${sitemapPath(name)}` })),
    );
    expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain("<loc>https://example.com/sitemaps/models/sitemap.xml</loc>");
    expect(xml.match(/<sitemap>/g)).toHaveLength(5);
  });

  it("escapes XML and writes lastmod", () => {
    const xml = sitemapIndexXml([
      { url: "https://example.com/a?b=1&c=<2>", lastModified: new Date("2026-01-02T03:04:05Z") },
    ]);
    expect(xml).toContain("<loc>https://example.com/a?b=1&amp;c=&lt;2&gt;</loc>");
    expect(xml).toContain("<lastmod>2026-01-02T03:04:05.000Z</lastmod>");
  });
});
