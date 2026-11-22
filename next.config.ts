import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

import { baseSecurityHeaders, buildCsp, SENSITIVE_PREFIXES } from "./src/lib/security/csp";

const mediaBase = process.env.NEXT_PUBLIC_MEDIA_BASE_URL?.replace(/\/+$/, "");

/**
 * Private areas: never indexed. Pages also set <meta name="robots">; the
 * header covers redirects, route handlers and anything a page forgets.
 * src/app/robots.ts only blocks /admin and /api: blocking the others would
 * stop crawlers seeing this noindex, and linked URLs could still be indexed.
 */
const NOINDEX_PATHS = [
  "/admin/:path*",
  "/account/:path*",
  "/basket",
  "/checkout",
  "/orders/:path*",
  "/sell/track/:path*",
  "/sign-in/:path*",
  "/api/:path*",
  "/offline",
];

/*
 * Security headers (src/lib/security/csp.ts). Every response gets HSTS,
 * Referrer-Policy, Permissions-Policy and framing protection. Public pages
 * get the static CSP here; sensitive routes get a per-request nonce CSP from
 * src/proxy.ts instead, so they're left out of this one.
 */
const sensitive = SENSITIVE_PREFIXES.map((p) => p.slice(1)).join("|");
const publicCsp = buildCsp({
  isDev: process.env.NODE_ENV === "development",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  mediaBaseUrl: mediaBase,
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
});

const nextConfig: NextConfig = {
  cacheComponents: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: baseSecurityHeaders() },
      {
        source: `/((?!(?:${sensitive})(?:/|$)).*)`,
        headers: [{ key: "Content-Security-Policy", value: publicCsp }],
      },
      ...NOINDEX_PATHS.map((source) => ({
        source,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      })),
      {
        // The service worker (npm run build:sw). Always re-checked, so
        // updates reach customers on their next visit.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
  images: {
    // Product photos from the R2 media bucket, and guide images from Sanity.
    remotePatterns: [
      ...(mediaBase ? [new URL(`${mediaBase}/**`)] : []),
      new URL("https://cdn.sanity.io/images/**"),
    ],
    formats: ["image/avif", "image/webp"],
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

/*
 * Sentry (src/instrumentation*.ts). Source maps are uploaded only when
 * SENTRY_AUTH_TOKEN is set, then deleted from the build so they're never
 * served publicly.
 */
const sentryUpload = Boolean(process.env.SENTRY_AUTH_TOKEN);
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  sourcemaps: { disable: !sentryUpload, deleteSourcemapsAfterUpload: true },
  widenClientFileUpload: sentryUpload,
  // The manifest is only for naming traces (we don't trace) and would list
  // every route, admin included, in the public bundle.
  routeManifestInjection: false,
});
