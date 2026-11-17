import { z } from "zod";

/**
 * Public, build-time environment variables. Server-only secrets get their
 * own schema in a server-only module when they are introduced.
 * Keep .env.example in sync with this file.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  /** Cloudflare Turnstile site key. Unset: the widget isn't shown (dev/tests). */
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1).optional(),
});

export const publicEnv = publicEnvSchema.parse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || undefined,
});
