import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/account", "/basket", "/checkout", "/orders", "/api"],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
