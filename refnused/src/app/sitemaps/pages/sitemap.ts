import type { MetadataRoute } from "next";

import { orFallback } from "@/lib/shop/load";
import { cachedShopBrands, cachedShopCategories } from "@/lib/shop/queries";
import { sitemapEntry } from "@/lib/sitemaps";

/** Landing and listing pages: home, sell, shop (with category and brand listings), stores, guides. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, brands] = await Promise.all([
    orFallback("sitemap categories", cachedShopCategories, []),
    orFallback("sitemap brands", cachedShopBrands, []),
  ]);
  return [
    sitemapEntry("/", { changeFrequency: "daily", priority: 1 }),
    sitemapEntry("/sell", { changeFrequency: "daily", priority: 0.9 }),
    sitemapEntry("/shop", { changeFrequency: "hourly", priority: 0.9 }),
    sitemapEntry("/stores", { changeFrequency: "monthly", priority: 0.8 }),
    sitemapEntry("/guides", { changeFrequency: "weekly", priority: 0.7 }),
    ...categories.map((c) =>
      sitemapEntry(`/shop/category/${c.slug}`, { changeFrequency: "daily", priority: 0.8 }),
    ),
    ...brands.map((b) =>
      sitemapEntry(`/shop/${b.slug}`, { changeFrequency: "daily", priority: 0.7 }),
    ),
  ];
}
