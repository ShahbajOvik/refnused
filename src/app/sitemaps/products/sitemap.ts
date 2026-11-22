import type { MetadataRoute } from "next";

import { mediaUrl } from "@/lib/media";
import { orFallback } from "@/lib/shop/load";
import { productPath } from "@/lib/shop/paths";
import { cachedProductSitemap } from "@/lib/shop/queries";
import { sitemapEntry } from "@/lib/sitemaps";

/** One page per unit for sale or reserved, with its photos (image sitemap). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await orFallback("sitemap products", cachedProductSitemap, []);
  return products.map((p) =>
    sitemapEntry(productPath({ brandSlug: p.brand, slug: p.slug }), {
      lastModified: p.updatedAt,
      changeFrequency: "daily",
      priority: 0.6,
      images: p.photos.slice(0, 5).map((photo) => mediaUrl(photo.key)),
    }),
  );
}
