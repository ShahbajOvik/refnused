import "server-only";

import { z } from "zod";

/**
 * Server-only environment. Importing this from a Client Component fails the
 * build, so secrets can't leak into browser bundles.
 * Keep .env.example in sync with this file.
 */
const serverEnvSchema = z
  .object({
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
    AUTH_GOOGLE_ID: z.string().min(1).optional(),
    AUTH_GOOGLE_SECRET: z.string().min(1).optional(),
    AUTH_RESEND_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(3).default("RefurbednUsed <no-reply@example.com>"),
    FIELD_ENCRYPTION_KEYS: z.string().min(1),
  })
  .refine((env) => !!env.AUTH_GOOGLE_ID === !!env.AUTH_GOOGLE_SECRET, {
    message: "Set both AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET, or neither",
  });

export const serverEnv = serverEnvSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID || undefined,
  AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET || undefined,
  AUTH_RESEND_KEY: process.env.AUTH_RESEND_KEY || undefined,
  EMAIL_FROM: process.env.EMAIL_FROM || undefined,
  FIELD_ENCRYPTION_KEYS: process.env.FIELD_ENCRYPTION_KEYS,
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
