import { createHash } from "node:crypto";

import { eq, lt, sql } from "drizzle-orm";

import { rateLimits } from "../../db/schema";
import { mysqlDatetime } from "../../db/datetime";
import type { AppDb } from "../../db/types";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets. */
  retryAfterSeconds: number;
};

/**
 * Fixed-window rate limit in Postgres: one atomic upsert per call, so it
 * works across serverless instances without extra infrastructure.
 */
export async function consumeRateLimit(
  db: AppDb,
  input: { key: string; limit: number; windowSeconds: number; now?: Date },
): Promise<RateLimitResult> {
  const now = input.now ?? new Date();
  const windowStartCutoff = new Date(now.getTime() - input.windowSeconds * 1000);
  const cutoff = mysqlDatetime(windowStartCutoff);
  const nowValue = mysqlDatetime(now);

  // Written out because the order matters: MySQL applies ON DUPLICATE KEY
  // UPDATE assignments left to right and later ones see earlier results, so
  // count must be decided before window_start moves (Drizzle's builder emits
  // them in column order). If the window has expired, start a new one.
  await db.execute(sql`
    insert into rate_limits (\`key\`, window_start, count)
    values (${input.key}, cast(${nowValue} as datetime(3)), 1)
    on duplicate key update
      count = if(window_start <= cast(${cutoff} as datetime(3)), 1, count + 1),
      window_start = if(window_start <= cast(${cutoff} as datetime(3)), cast(${nowValue} as datetime(3)), window_start)`);
  const [row] = await db
    .select({ count: rateLimits.count, windowStart: rateLimits.windowStart })
    .from(rateLimits)
    .where(eq(rateLimits.key, input.key));

  // Occasionally clear out old counters.
  if (Math.random() < 0.01) {
    await db
      .delete(rateLimits)
      .where(lt(rateLimits.windowStart, new Date(now.getTime() - 86_400_000)));
  }

  const count = row?.count ?? 1;
  const windowStart = row?.windowStart ?? now;
  const resetAt = windowStart.getTime() + input.windowSeconds * 1000;
  return {
    allowed: count <= input.limit,
    remaining: Math.max(0, input.limit - count),
    retryAfterSeconds: Math.max(0, Math.ceil((resetAt - now.getTime()) / 1000)),
  };
}

/** Hashes an identifier (IP, email) so it isn't stored in clear. */
export function rateLimitKey(scope: string, identifier: string, secret: string) {
  const hash = createHash("sha256")
    .update(`${secret}:${identifier.toLowerCase()}`)
    .digest("base64url");
  return `${scope}:${hash.slice(0, 32)}`;
}
