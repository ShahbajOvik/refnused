import "server-only";

import { db } from "../../db";
import { serverEnv, turnstileEnabled } from "../env.server";

import { consumeRateLimit, rateLimitKey } from "./rate-limit";
import { verifyTurnstile } from "./turnstile";

/*
 * Checks shared by public Server Actions. Every public form that writes
 * data needs Zod validation, a rate limit and Turnstile (see CLAUDE.md).
 */

export const TOO_MANY_REQUESTS =
  "You’ve made a lot of requests. Please wait a few minutes and try again.";

export const BOT_CHECK_FAILED = "We couldn’t confirm you’re not a robot. Please try again.";

/** Counts one request; true when the caller is over the limit. */
export async function isRateLimited(
  scope: string,
  identifier: string,
  limit: number,
  windowSeconds: number,
) {
  const result = await consumeRateLimit(db, {
    key: rateLimitKey(scope, identifier, serverEnv.AUTH_SECRET),
    limit,
    windowSeconds,
  });
  return !result.allowed;
}

/** Verifies a Turnstile token (skipped when Turnstile isn't configured: dev and tests). */
export async function passesBotCheck(
  token: string | null,
  action: string,
  remoteIp: string | null | undefined,
) {
  if (!turnstileEnabled) return true;
  const check = await verifyTurnstile(token, {
    secret: serverEnv.TURNSTILE_SECRET_KEY!,
    remoteIp,
    action,
  });
  return check.success;
}
