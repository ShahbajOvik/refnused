import "server-only";

import { z } from "zod";

import { publicEnv } from "./env";

/**
 * Server-only environment. Importing this from a Client Component fails the
 * build, so secrets can't leak into browser bundles.
 * Keep .env.example in sync with this file.
 */
const serverEnvSchema = z
  .object({
    // pglite:// is for tests and CI builds only (see src/db/client.ts).
    DATABASE_URL: z.url({ protocol: /^(postgres(ql)?|pglite)$/ }),
    /** Connections per server instance (default 5 in production, 10 otherwise). */
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).optional(),
    AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
    AUTH_GOOGLE_ID: z.string().min(1).optional(),
    AUTH_GOOGLE_SECRET: z.string().min(1).optional(),
    AUTH_RESEND_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(3).default("RefurbednUsed <no-reply@example.com>"),
    FIELD_ENCRYPTION_KEYS: z.string().min(1),
    TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
    TWILIO_ACCOUNT_SID: z.string().startsWith("AC").optional(),
    TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
    /** Sender: an E.164 number or a Messaging Service SID (MG…). */
    TWILIO_FROM: z.string().min(1).optional(),
    /** Stripe secret key (sk_test_… or sk_live_…). Unset: a stand-in gateway (dev/tests only). */
    STRIPE_SECRET_KEY: z
      .string()
      .regex(/^sk_(test|live)_/)
      .optional(),
    /** Signing secret of the webhook endpoint (whsec_…). */
    STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
    R2_ACCOUNT_ID: z.string().min(1).optional(),
    R2_ACCESS_KEY_ID: z.string().min(1).optional(),
    R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    /** Public bucket (custom domain = NEXT_PUBLIC_MEDIA_BASE_URL) for photos. */
    R2_MEDIA_BUCKET: z.string().min(1).optional(),
    /** Private bucket for data-wipe certificates. */
    R2_PRIVATE_BUCKET: z.string().min(1).optional(),
    /** Without R2: folder for uploads (development and tests only). */
    MEDIA_LOCAL_DIR: z.string().min(1).optional(),
    /** Sanity Studio URL, for the admin content links. */
    SANITY_STUDIO_URL: z.url().optional(),
    /** Sanity project for /guides. Unset: only the built-in guides are shown. */
    SANITY_PROJECT_ID: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .optional(),
    SANITY_DATASET: z
      .string()
      .regex(/^[a-z0-9_-]+$/)
      .default("production"),
    /** Pinned Sanity API version (a date). */
    SANITY_API_VERSION: z.iso.date().default("2025-02-19"),
    /** Read token, only needed for a private dataset. */
    SANITY_API_READ_TOKEN: z.string().min(1).optional(),
    /** Secret of the Sanity webhook that calls /api/revalidate/sanity. */
    SANITY_REVALIDATE_SECRET: z.string().min(16).optional(),
    /**
     * Shared by the website and admin: the admin signs requests to the
     * website's /api/revalidate/tags with it after changing products,
     * prices or stores. At least 32 characters: npm run secret:generate
     */
    REVALIDATE_SECRET: z.string().min(32).optional(),
    /** VAPID private key for Web Push (base64url, 43 characters). Pair: NEXT_PUBLIC_VAPID_PUBLIC_KEY. */
    VAPID_PRIVATE_KEY: z
      .string()
      .regex(/^[A-Za-z0-9_-]{42,44}$/, "Use the private key from npm run push:keys")
      .optional(),
    /** Contact push services can use about our messages: mailto: or https: URL. */
    VAPID_SUBJECT: z
      .string()
      .regex(/^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/, "Use mailto:… or https://…")
      .default("mailto:support@example.com"),
  })
  .refine((env) => !!env.AUTH_GOOGLE_ID === !!env.AUTH_GOOGLE_SECRET, {
    message: "Set both AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET, or neither",
  })
  .refine((env) => !!env.VAPID_PRIVATE_KEY === !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, {
    message: "Set both VAPID_PRIVATE_KEY and NEXT_PUBLIC_VAPID_PUBLIC_KEY, or neither",
  });

export const serverEnv = serverEnvSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX || undefined,
  AUTH_SECRET: process.env.AUTH_SECRET,
  AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID || undefined,
  AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET || undefined,
  AUTH_RESEND_KEY: process.env.AUTH_RESEND_KEY || undefined,
  EMAIL_FROM: process.env.EMAIL_FROM || undefined,
  FIELD_ENCRYPTION_KEYS: process.env.FIELD_ENCRYPTION_KEYS,
  TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY || undefined,
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || undefined,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || undefined,
  TWILIO_FROM: process.env.TWILIO_FROM || undefined,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || undefined,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || undefined,
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID || undefined,
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || undefined,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || undefined,
  R2_MEDIA_BUCKET: process.env.R2_MEDIA_BUCKET || undefined,
  R2_PRIVATE_BUCKET: process.env.R2_PRIVATE_BUCKET || undefined,
  MEDIA_LOCAL_DIR: process.env.MEDIA_LOCAL_DIR || undefined,
  SANITY_STUDIO_URL: process.env.SANITY_STUDIO_URL || undefined,
  SANITY_PROJECT_ID: process.env.SANITY_PROJECT_ID || undefined,
  SANITY_DATASET: process.env.SANITY_DATASET || undefined,
  SANITY_API_VERSION: process.env.SANITY_API_VERSION || undefined,
  SANITY_API_READ_TOKEN: process.env.SANITY_API_READ_TOKEN || undefined,
  SANITY_REVALIDATE_SECRET: process.env.SANITY_REVALIDATE_SECRET || undefined,
  REVALIDATE_SECRET: process.env.REVALIDATE_SECRET || undefined,
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || undefined,
  VAPID_SUBJECT: process.env.VAPID_SUBJECT || undefined,
});

export const isGoogleSignInEnabled = Boolean(serverEnv.AUTH_GOOGLE_ID);

/**
 * Without a Resend key, magic links are printed to the server console
 * instead of emailed. Not allowed on the live site.
 */
export const logMagicLinksToConsole = !serverEnv.AUTH_RESEND_KEY;
if (logMagicLinksToConsole && process.env.VERCEL_ENV === "production") {
  throw new Error("AUTH_RESEND_KEY is required in production");
}

/** Without Turnstile keys, bot checks are skipped (development and tests only). */
export const turnstileEnabled = Boolean(serverEnv.TURNSTILE_SECRET_KEY);

/** Without Twilio credentials, SMS messages are printed to the console. */
export const smsEnabled = Boolean(
  serverEnv.TWILIO_ACCOUNT_SID && serverEnv.TWILIO_AUTH_TOKEN && serverEnv.TWILIO_FROM,
);

/** Guides come from Sanity when a project is set; built-in guides are always shown. */
export const sanityEnabled = Boolean(serverEnv.SANITY_PROJECT_ID);

/** Web Push is sent when both VAPID keys are set; otherwise pushes are printed to the console. */
export const pushEnabled = Boolean(serverEnv.VAPID_PRIVATE_KEY);

/** Real Stripe payments. Without a secret key a stand-in gateway is used (never in production). */
export const stripeEnabled = Boolean(serverEnv.STRIPE_SECRET_KEY);

if (process.env.VERCEL_ENV === "production") {
  // Secure cookies, HSTS and upgrade-insecure-requests all depend on this.
  if (!publicEnv.NEXT_PUBLIC_SITE_URL.startsWith("https://")) {
    throw new Error("NEXT_PUBLIC_SITE_URL must use https:// in production");
  }
  if (!publicEnv.NEXT_PUBLIC_ADMIN_URL.startsWith("https://")) {
    throw new Error("NEXT_PUBLIC_ADMIN_URL must use https:// in production");
  }
  if (!serverEnv.REVALIDATE_SECRET) {
    throw new Error("REVALIDATE_SECRET is required in production (admin → website cache refresh)");
  }
  if (process.env.EMAIL_OUTBOX_DIR) throw new Error("EMAIL_OUTBOX_DIR is for tests only");
  if (!stripeEnabled || !serverEnv.STRIPE_WEBHOOK_SECRET) {
    throw new Error("STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are required in production");
  }
  if (serverEnv.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
    throw new Error("Use a live Stripe key in production");
  }
  if (!turnstileEnabled) throw new Error("TURNSTILE_SECRET_KEY is required in production");
  if (!smsEnabled) throw new Error("Twilio settings are required in production");
  if (pushEnabled && serverEnv.VAPID_SUBJECT.endsWith("@example.com")) {
    throw new Error("Set VAPID_SUBJECT to a real contact address in production");
  }
}
