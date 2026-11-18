import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/seo";
import { orFallback } from "@/lib/shop/load";
import { cachedProductParams, cachedShopBrands } from "@/lib/shop/queries";
import { storePath } from "@/lib/stores";
import { loadPublicStores } from "@/lib/stores-cache";

/** Public, indexable pages. Account, checkout, order and admin pages are left out. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [stores, brands, products] = await Promise.all([
    loadPublicStores(),
    orFallback("sitemap brands", cachedShopBrands, []),
    orFallback("sitemap products", cachedProductParams, []),
  ]);
  return [
    { url: absoluteUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/sell"), changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/shop"), changeFrequency: "hourly", priority: 0.9 },
    { url: absoluteUrl("/stores"), changeFrequency: "monthly", priority: 0.8 },
    ...stores.map((s) => ({
      url: absoluteUrl(storePath(s)),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...brands.map((b) => ({
      url: absoluteUrl(`/shop/${b.slug}`),
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...products.map((p) => ({
      url: absoluteUrl(`/shop/${p.brand}/${p.slug}`),
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
  ];
}
