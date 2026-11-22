// @vitest-environment node
import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { sanityWebhookBodySchema, signSanityWebhook, verifySanityWebhook } from "./webhook";

const secret = "test-secret-not-real-0123456789";
const body = JSON.stringify({ _type: "guide", slug: "best-phones" });
const now = 1_790_000_000_000;

describe("verifySanityWebhook", () => {
  it("accepts a correctly signed, fresh request", () => {
    const header = signSanityWebhook(secret, body, now);
    expect(verifySanityWebhook({ secret, body, header, now: now + 1000 })).toBe(true);
  });

  it("matches Sanity's scheme: base64url HMAC-SHA256 of '<t>.<body>'", () => {
    const sig = createHmac("sha256", secret).update(`${now}.${body}`).digest("base64url");
    expect(verifySanityWebhook({ secret, body, header: `t=${now},v1=${sig}`, now })).toBe(true);
  });

  it("rejects a tampered body, wrong secret or missing header", () => {
    const header = signSanityWebhook(secret, body, now);
    expect(verifySanityWebhook({ secret, body: `${body} `, header, now })).toBe(false);
    expect(verifySanityWebhook({ secret: `${secret}x`, body, header, now })).toBe(false);
    expect(verifySanityWebhook({ secret, body, header: null, now })).toBe(false);
    expect(verifySanityWebhook({ secret, body, header: "garbage", now })).toBe(false);
  });

  it("rejects replays outside five minutes", () => {
    const header = signSanityWebhook(secret, body, now);
    expect(verifySanityWebhook({ secret, body, header, now: now + 5 * 60_000 + 1 })).toBe(false);
    expect(verifySanityWebhook({ secret, body, header, now: now - 5 * 60_000 - 1 })).toBe(false);
  });
});

describe("sanityWebhookBodySchema", () => {
  it("accepts the projection and rejects anything else", () => {
    expect(sanityWebhookBodySchema.safeParse({ _type: "guide", slug: null }).success).toBe(true);
    expect(sanityWebhookBodySchema.safeParse({ slug: "x" }).success).toBe(false);
    expect(sanityWebhookBodySchema.safeParse({ _type: "" }).success).toBe(false);
  });
});
