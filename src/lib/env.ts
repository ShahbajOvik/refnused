import { z } from "zod";

/**
 * Public, build-time environment variables. Server-only secrets get their
 * own schema in a server-only module when they are introduced.
 * Keep .env.example in sync with this file.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
});

export const publicEnv = publicEnvSchema.parse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});
