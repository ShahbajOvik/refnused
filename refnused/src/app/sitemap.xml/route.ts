import { absoluteUrl } from "@/lib/seo";
import { SITEMAPS, sitemapIndexXml, sitemapPath } from "@/lib/sitemaps";

/** Sitemap index: one sitemap per page type (src/app/sitemaps/*). */
export function GET() {
  const xml = sitemapIndexXml(SITEMAPS.map((name) => ({ url: absoluteUrl(sitemapPath(name)) })));
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
