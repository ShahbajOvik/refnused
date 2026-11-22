import type { MetadataRoute } from "next";

import { cachedSellableModels } from "@/lib/guides/queries";
import { orFallback } from "@/lib/shop/load";
import { sitemapEntry } from "@/lib/sitemaps";

/** Sell pages: one per brand and one per model we buy. lastmod is the model's latest price change. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const models = await orFallback("sitemap models", cachedSellableModels, []);
  const brands = new Map<string, Date | null>();
  for (const m of models) {
    const last = brands.get(m.brandSlug);
    if (!last || (m.pricesUpdatedAt && m.pricesUpdatedAt > last)) {
      brands.set(m.brandSlug, m.pricesUpdatedAt);
    }
  }
  return [
    ...[...brands].map(([brand, lastModified]) =>
      sitemapEntry(`/sell/${brand}`, { lastModified, changeFrequency: "weekly", priority: 0.8 }),
    ),
    ...models.map((m) =>
      sitemapEntry(`/sell/${m.brandSlug}/${m.slug}`, {
        lastModified: m.pricesUpdatedAt,
        changeFrequency: "weekly",
        priority: 0.8,
      }),
    ),
  ];
}
