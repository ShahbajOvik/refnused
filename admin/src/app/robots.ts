import type { MetadataRoute } from "next";

/** Staff-only: nothing here should be crawled. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
