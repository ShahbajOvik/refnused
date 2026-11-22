import { z } from "zod";

/**
 * Public, build-time environment variables. Server-only secrets get their
 * own schema in a server-only module when they are introduced.
 * Keep .env.example in sync with this file.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  /** The admin app's own address (its own Vercel project), e.g. https://admin.example.co.uk. */
  NEXT_PUBLIC_ADMIN_URL: z.url().default("http://localhost:3001"),
  /** Cloudflare Turnstile site key. Unset: the widget isn't shown (dev/tests). */
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1).optional(),
  /**
   * Public URL of the Cloudflare R2 media bucket (custom domain), no trailing
   * slash. Unset: media is served from /media in public/ (sample data only).
   */
  /** Stripe publishable key (pk_…), for the Payment Element. */
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z
    .string()
    .regex(/^pk_(test|live)_/)
    .optional(),
  NEXT_PUBLIC_MEDIA_BASE_URL: z
    .url({ protocol: /^https?$/ })
    .transform((url) => url.replace(/\/+$/, ""))
    .optional(),
  /**
   * VAPID public key for Web Push (base64url P-256 point, 87 characters).
   * Unset: the "get updates" buttons are hidden. Pair: VAPID_PRIVATE_KEY.
   */
  /** Sentry DSN (not a secret). Unset: no error reporting. */
  NEXT_PUBLIC_SENTRY_DSN: z.url({ protocol: /^https$/ }).optional(),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z
    .string()
    .regex(/^[A-Za-z0-9_-]{86,88}$/, "Use the public key from npm run push:keys")
    .optional(),
});

export const publicEnv = publicEnvSchema.parse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_ADMIN_URL: process.env.NEXT_PUBLIC_ADMIN_URL || undefined,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || undefined,
  NEXT_PUBLIC_MEDIA_BASE_URL: process.env.NEXT_PUBLIC_MEDIA_BASE_URL || undefined,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || undefined,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || undefined,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
});
