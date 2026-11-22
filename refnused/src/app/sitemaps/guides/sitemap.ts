import type { MetadataRoute } from "next";

import { cachedGuideSummaries } from "@/lib/guides/queries";
import { guidePath } from "@refnused/database/lib/guides/slugs";
import { orFallback } from "@/lib/shop/load";
import { sitemapEntry } from "@/lib/sitemaps";

/** Built-in guides (including one price guide per model we buy) and Sanity articles. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const guides = await orFallback("sitemap guides", cachedGuideSummaries, []);
  return guides.map((g) =>
    sitemapEntry(guidePath(g.slug), {
      lastModified: g.updatedAt,
      changeFrequency: g.template === "model-value" ? "weekly" : "monthly",
      priority: g.template === "model-value" ? 0.7 : 0.6,
    }),
  );
}
