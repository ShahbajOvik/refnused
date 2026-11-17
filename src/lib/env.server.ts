import "server-only";

import { z } from "zod";

/**
 * Server-only environment. Importing this from a Client Component fails the
 * build, so secrets can't leak into browser bundles.
 * Keep .env.example in sync with this file.
 */
const serverEnvSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

export const serverEnv = serverEnvSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
});
