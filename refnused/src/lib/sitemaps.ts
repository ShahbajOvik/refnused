import type { MetadataRoute } from "next";

import { SITE_LANGUAGE } from "@/lib/metadata";
import { absoluteUrl } from "@refnused/database/lib/seo";

/*
 * Split sitemaps. /sitemap.xml is a sitemap index (src/app/sitemap.xml) that
 * points at one sitemap per page type (src/app/sitemaps/<name>/sitemap.ts).
 * Only public, indexable pages go in them.
 */

export const SITEMAPS = ["pages", "models", "products", "stores", "guides"] as const;
export type SitemapName = (typeof SITEMAPS)[number];

export function sitemapPath(name: SitemapName): string {
  return `/sitemaps/${name}/sitemap.xml`;
}

type Entry = MetadataRoute.Sitemap[number];

export function sitemapEntry(
  path: string,
  options: {
    lastModified?: Date | string | null;
    changeFrequency?: Entry["changeFrequency"];
    priority?: number;
    images?: string[];
  } = {},
): Entry {
  const url = absoluteUrl(path);
  return {
    url,
    ...(options.lastModified ? { lastModified: new Date(options.lastModified) } : {}),
    ...(options.changeFrequency ? { changeFrequency: options.changeFrequency } : {}),
    ...(options.priority !== undefined ? { priority: options.priority } : {}),
    ...(options.images?.length ? { images: options.images.map((src) => absoluteUrl(src)) } : {}),
    alternates: { languages: { [SITE_LANGUAGE]: url, "x-default": url } },
  };
}

function escapeXml(value: string): string {
  return value.replace(
    /[<>&'"]/g,
    (c) => `&${{ "<": "lt", ">": "gt", "&": "amp", "'": "apos", '"': "quot" }[c]};`,
  );
}

/** <sitemapindex> listing each sitemap. Next has no built-in index. */
export function sitemapIndexXml(entries: { url: string; lastModified?: Date | null }[]): string {
  const items = entries
    .map(
      (e) =>
        `<sitemap><loc>${escapeXml(e.url)}</loc>${
          e.lastModified ? `<lastmod>${e.lastModified.toISOString()}</lastmod>` : ""
        }</sitemap>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items}</sitemapindex>\n`;
}
