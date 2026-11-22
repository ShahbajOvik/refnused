import type { MetadataRoute } from "next";

import { sitemapEntry } from "@/lib/sitemaps";
import { storePath } from "@refnused/database/lib/stores";
import { loadPublicStores } from "@/lib/stores-cache";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const stores = await loadPublicStores();
  return stores.map((s) =>
    sitemapEntry(storePath(s), { changeFrequency: "weekly", priority: 0.8 }),
  );
}
