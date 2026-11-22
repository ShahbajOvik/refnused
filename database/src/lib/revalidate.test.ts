import { describe, expect, it } from "vitest";

import { revalidateBodySchema, signRevalidation, verifyRevalidation } from "./revalidate";

const SECRET = "x".repeat(40);
const BODY = JSON.stringify({ tags: ["products"] });

describe("revalidation signatures", () => {
  it("accepts a fresh signature over the exact body", () => {
    const header = signRevalidation(SECRET, BODY, 1_700_000_000_000);
    expect(verifyRevalidation({ secret: SECRET, body: BODY, header, now: 1_700_000_060_000 })).toBe(
      true,
    );
  });

  it("rejects stale, tampered, wrongly signed or missing signatures", () => {
    const now = 1_700_000_000_000;
    const header = signRevalidation(SECRET, BODY, now);
    expect(verifyRevalidation({ secret: SECRET, body: BODY, header, now: now + 6 * 60_000 })).toBe(
      false,
    );
    expect(
      verifyRevalidation({ secret: SECRET, body: BODY.replace("products", "stores"), header, now }),
    ).toBe(false);
    expect(verifyRevalidation({ secret: "y".repeat(40), body: BODY, header, now })).toBe(false);
    expect(verifyRevalidation({ secret: SECRET, body: BODY, header: null, now })).toBe(false);
    expect(verifyRevalidation({ secret: SECRET, body: BODY, header: "t=1,v1=abc", now })).toBe(
      false,
    );
  });

  it("only accepts the website's cache tags", () => {
    expect(
      revalidateBodySchema.safeParse({
        tags: ["products", "product:6f1c2b0a-1111-4222-8333-944455556666"],
      }).success,
    ).toBe(true);
    expect(revalidateBodySchema.safeParse({ tags: ["sessions"] }).success).toBe(false);
    expect(revalidateBodySchema.safeParse({ tags: [] }).success).toBe(false);
  });
});
