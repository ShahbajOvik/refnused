import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

import { loadRootEnv } from "../database/src/config/root-env";
import { baseSecurityHeaders } from "../database/src/lib/security/csp";

// One .env.local at the repo root is shared by all apps (Next.js only
// reads the app's own folder). Values already set (e.g. on Vercel) win.
loadRootEnv(`${process.cwd()}/..`);

const mediaBase = process.env.NEXT_PUBLIC_MEDIA_BASE_URL?.replace(/\/+$/, "");

/*
 * The staff admin. Every page renders per request with a strict nonce CSP
 * (src/proxy.ts); these are the headers for every response, and nothing
 * here is ever indexed or cached.
 */
const nextConfig: NextConfig = {
  cacheComponents: true,
  poweredByHeader: false,
  transpilePackages: ["@refnused/database"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...baseSecurityHeaders(),
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
  images: {
    remotePatterns: mediaBase ? [new URL(`${mediaBase}/**`)] : [],
    formats: ["image/avif", "image/webp"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

const sentryUpload = Boolean(process.env.SENTRY_AUTH_TOKEN);
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_ADMIN_PROJECT ?? process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  sourcemaps: { disable: !sentryUpload, deleteSourcemapsAfterUpload: true },
  widenClientFileUpload: sentryUpload,
  routeManifestInjection: false,
});
