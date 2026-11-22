import { createHash } from "node:crypto";

import { THEME_INIT_SCRIPT } from "./theme-script";

/*
 * Content Security Policy and other security headers. Pure, so it's tested
 * and shared by next.config.ts (public pages) and src/proxy.ts (sensitive
 * pages).
 *
 * Two CSPs, because a nonce needs a per-request render and the catalogue
 * pages are prerendered (Cache Components):
 *
 * - Sensitive routes (SENSITIVE_PREFIXES: account, basket, checkout,
 *   orders, trade-in tracking, sign-in, admin) render per request and get a
 *   strict policy: a fresh nonce plus 'strict-dynamic'. Only scripts Next.js
 *   marks with the nonce, and scripts those load (Stripe, Turnstile), run.
 * - Public pages keep their static shells, so their inline RSC scripts
 *   can't carry a nonce. They allow inline scripts but nothing from other
 *   hosts except those listed, and still no eval, plugins, framing or
 *   foreign form targets.
 */

/**
 * Website routes with personal or payment data: strict nonce CSP, rendered
 * per request. (The admin app applies the strict policy to every page.)
 */
export const SENSITIVE_PREFIXES = [
  "/account",
  "/basket",
  "/checkout",
  "/orders",
  "/sell/track",
  "/sign-in",
] as const;

export function isSensitivePath(pathname: string): boolean {
  return SENSITIVE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * sha256 of the theme script in the root layout (THEME_INIT_SCRIPT). The
 * root layout can't read the nonce without making every page dynamic, so
 * the strict policy allows that one inline script by hash. Computed from
 * the constant itself, so it can't go stale.
 */
export const THEME_SCRIPT_HASH = `sha256-${createHash("sha256").update(THEME_INIT_SCRIPT).digest("base64")}`;

export type CspOptions = {
  /** Present: the strict, per-request policy. Absent: the public policy. */
  nonce?: string;
  isDev: boolean;
  /** NEXT_PUBLIC_SITE_URL; https turns on upgrade-insecure-requests. */
  siteUrl: string;
  /** NEXT_PUBLIC_MEDIA_BASE_URL (R2 public domain), if set. */
  mediaBaseUrl?: string;
  /** NEXT_PUBLIC_SENTRY_DSN, if set: its ingest host is allowed for connect-src. */
  sentryDsn?: string;
};

function origin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

const STRIPE = ["https://js.stripe.com", "https://*.js.stripe.com"];
const TURNSTILE = "https://challenges.cloudflare.com";

export function buildCsp(options: CspOptions): string {
  const media = origin(options.mediaBaseUrl);
  const sentry = origin(options.sentryDsn);
  const dev = options.isDev;

  const scriptSrc = options.nonce
    ? [
        `'nonce-${options.nonce}'`,
        "'strict-dynamic'",
        `'${THEME_SCRIPT_HASH}'`,
        // Ignored by browsers that understand 'strict-dynamic'; a fallback for old ones.
        "'unsafe-inline'",
        "https:",
      ]
    : ["'self'", "'unsafe-inline'", ...STRIPE, TURNSTILE];
  // React's development build uses eval for error stacks; production never does.
  if (dev) scriptSrc.push("'unsafe-eval'");

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": scriptSrc,
    // Inline style attributes come from React, Motion and sonner. A nonce
    // can't cover style="" attributes, so styles stay 'unsafe-inline'.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      "https://cdn.sanity.io",
      "https://*.stripe.com",
      ...(media ? [media] : []),
    ],
    "font-src": ["'self'"],
    "connect-src": [
      "'self'",
      "https://api.stripe.com",
      "https://*.js.stripe.com",
      TURNSTILE,
      ...(media ? [media] : []),
      ...(sentry ? [sentry] : []),
      ...(dev ? ["ws:"] : []),
    ],
    "frame-src": [
      ...STRIPE,
      "https://hooks.stripe.com",
      TURNSTILE,
      // Store maps (public store pages only).
      ...(options.nonce ? [] : ["https://www.google.com"]),
    ],
    "media-src": ["'self'", ...(media ? [media] : [])],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    // Google sign-in posts to Auth.js, which redirects to Google.
    "form-action": ["'self'", "https://accounts.google.com"],
    "frame-ancestors": ["'none'"],
  };

  const parts = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (!dev && options.siteUrl.startsWith("https://")) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

/** A fresh nonce: 128 random bits, base64. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/** Headers for every response (next.config.ts). The CSP is added separately. */
export function baseSecurityHeaders(): { key: string; value: string }[] {
  return [
    // Two years, all subdomains. Submit to hstspreload.org only once every
    // subdomain serves HTTPS (see SECURITY.md).
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // For browsers without CSP frame-ancestors.
    { key: "X-Frame-Options", value: "DENY" },
    // Keeps other windows from scripting ours. allow-popups: Stripe 3-D Secure.
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    { key: "Cross-Origin-Resource-Policy", value: "same-site" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
    { key: "X-DNS-Prefetch-Control", value: "on" },
  ];
}

/**
 * Only what we use: the camera for the admin IMEI scanner, payments for
 * Stripe's Payment Element (Apple Pay / Google Pay), and fullscreen for the
 * 3D viewer. Everything else is off.
 */
export const PERMISSIONS_POLICY = [
  "camera=(self)",
  'payment=(self "https://js.stripe.com")',
  "fullscreen=(self)",
  "microphone=()",
  "geolocation=()",
  "usb=()",
  "serial=()",
  "bluetooth=()",
  "hid=()",
  "midi=()",
  "magnetometer=()",
  "gyroscope=()",
  "accelerometer=()",
  "display-capture=()",
  "browsing-topics=()",
  "publickey-credentials-get=(self)",
  "publickey-credentials-create=(self)",
].join(", ");
