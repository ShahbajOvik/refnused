import { createHash } from "node:crypto";

import { lt, sql } from "drizzle-orm";

import { rateLimits } from "../../db/schema";
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
  const cutoffIso = windowStartCutoff.toISOString();
  const nowIso = now.toISOString();

  const [row] = await db
    .insert(rateLimits)
    .values({ key: input.key, windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        // Start a new window if the old one has expired, otherwise count up.
        // Raw sql params bypass Drizzle's column mapping, and its postgres.js
        // driver doesn't serialise Date objects: pass ISO strings with casts.
        count: sql`case when ${rateLimits.windowStart} <= ${cutoffIso}::timestamptz then 1 else ${rateLimits.count} + 1 end`,
        windowStart: sql`case when ${rateLimits.windowStart} <= ${cutoffIso}::timestamptz then ${nowIso}::timestamptz else ${rateLimits.windowStart} end`,
      },
    })
    .returning({ count: rateLimits.count, windowStart: rateLimits.windowStart });

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
