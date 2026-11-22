import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

/*
 * Sanity webhook signatures (same scheme as @sanity/webhook):
 *   sanity-webhook-signature: t=<unix ms>,v1=<base64url HMAC-SHA256(secret, "<t>.<body>")>
 */

export const SANITY_SIGNATURE_HEADER = "sanity-webhook-signature";
/** Reject signatures older than this, so a captured request can't be replayed later. */
export const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

function sign(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("base64url");
}

/** For tests and local scripts. */
export function signSanityWebhook(secret: string, body: string, now = Date.now()): string {
  return `t=${now},v1=${sign(secret, String(now), body)}`;
}

export function verifySanityWebhook(input: {
  secret: string;
  body: string;
  header: string | null;
  now?: number;
}): boolean {
  const match = /^t=(\d{10,16}),\s*v1=([A-Za-z0-9_-]+)$/.exec(input.header?.trim() ?? "");
  if (!match) return false;
  const [, timestamp, signature] = match as unknown as [string, string, string];
  const ms = timestamp.length <= 10 ? Number(timestamp) * 1000 : Number(timestamp);
  if (Math.abs((input.now ?? Date.now()) - ms) > SIGNATURE_TOLERANCE_MS) return false;

  const expected = Buffer.from(sign(input.secret, timestamp, input.body));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** The webhook's projection: `{_type, "slug": slug.current}`. */
export const sanityWebhookBodySchema = z.object({
  _type: z.string().min(1).max(64),
  slug: z.string().max(200).nullish(),
});
