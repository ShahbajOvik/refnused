import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

/*
 * Cache refresh across apps. The website caches catalogue, product, price
 * and store data with cache tags; the admin changes that data in another
 * app (another Vercel project), so it asks the website to refresh with a
 * signed request to /api/revalidate/tags:
 *
 *   x-revalidate-signature: t=<unix ms>,v1=<base64url HMAC-SHA256(secret, "<t>.<body>")>
 *
 * Signed with REVALIDATE_SECRET (shared by both apps); requests older than
 * five minutes are rejected, and only known tags are accepted.
 */

export const REVALIDATE_PATH = "/api/revalidate/tags";
export const REVALIDATE_SIGNATURE_HEADER = "x-revalidate-signature";
export const REVALIDATE_TOLERANCE_MS = 5 * 60_000;

/** Tags the website uses with cacheTag(). */
export const PUBLIC_CACHE_TAG =
  /^(?:products|catalogue|trade-in-prices|stores|reviews|quote-questions|guides|product:[0-9a-f-]{36})$/;

export const revalidateBodySchema = z.object({
  tags: z.array(z.string().regex(PUBLIC_CACHE_TAG)).min(1).max(50),
});

function hmac(secret: string, timestamp: string, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("base64url");
}

export function signRevalidation(secret: string, body: string, now = Date.now()): string {
  return `t=${now},v1=${hmac(secret, String(now), body)}`;
}

export function verifyRevalidation(input: {
  secret: string;
  body: string;
  header: string | null;
  now?: number;
}): boolean {
  const match = input.header?.match(/^t=(\d{10,16}),v1=([A-Za-z0-9_-]{20,})$/);
  if (!match) return false;
  const [, timestamp, signature] = match as unknown as [string, string, string];
  if (Math.abs((input.now ?? Date.now()) - Number(timestamp)) > REVALIDATE_TOLERANCE_MS) {
    return false;
  }
  const expected = Buffer.from(hmac(input.secret, timestamp, input.body));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
