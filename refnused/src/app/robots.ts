import type { MetadataRoute } from "next";

import { absoluteUrl } from "@refnused/database/lib/seo";

/**
 * Account, basket, checkout and order pages are NOT blocked here: they send
 * noindex (meta tag and X-Robots-Tag, see next.config.ts), which crawlers can
 * only see if they're allowed to fetch the page. /admin and /api are never
 * linked publicly, so they're blocked outright.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/"],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
