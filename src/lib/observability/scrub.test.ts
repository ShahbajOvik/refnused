import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";

import { FILTERED, scrubBreadcrumb, scrubEvent, scrubString, scrubValue } from "./scrub";

describe("scrubString", () => {
  it.each([
    ["Failed for jo.bloggs@example.co.uk", "Failed for [email]"],
    ["Call 07700 900123 or +44 191 380 0456", "Call [phone] or [phone]"],
    ["Ship to NE29 6RR and ne33 1ht", "Ship to [postcode] and [postcode]"],
    ["IMEI 356938035643809 blocked", "IMEI [imei] blocked"],
    ["Sort code 12-34-56, account 12345678", "Sort code [sort-code], account [number]"],
    ["Card 4242 4242 4242 4242 declined", "Card [number] declined"],
    ["/sell/track/AbCdEfGhIjKlMnOpQrStUv/label", "/sell/track/[token]/label"],
    [
      "https://x.test/orders/AbCdEfGhIjKlMnOpQrStUv?redirect_status=succeeded",
      "https://x.test/orders/[token]?redirect_status=[Filtered]",
    ],
    ["/shop/alerts/AbCdEfGhIjKlMnOp", "/shop/alerts/[token]"],
    [
      "/sign-in?callbackUrl=%2Faccount&email=a%40b.c",
      "/sign-in?callbackUrl=[Filtered]&email=[Filtered]",
    ],
    ["key sk_live_51Habcdefghijkl and whsec_abcdefghijk", "key [secret] and [secret]"],
    ["Authorization: Bearer abc.def-ghi", "Authorization: Bearer [secret]"],
    ["pi_3Nabcdefgh_secret_XYZ123", "[secret]"],
  ])("%s", (input, expected) => {
    expect(scrubString(input)).toBe(expected);
  });

  it("leaves ordinary text alone", () => {
    for (const text of [
      "TypeError: Cannot read properties of undefined (reading 'map')",
      "GET /shop/apple/iphone-15-128gb-black-k3x9q2 500",
      "Order RU-1001 failed",
      "Took 1234ms",
    ]) {
      expect(scrubString(text)).toBe(text);
    }
  });
});

describe("scrubValue", () => {
  it("filters sensitive keys at any depth and scrubs other strings", () => {
    expect(
      scrubValue({
        email: "a@b.co",
        bank: { sortCode: "12-34-56", accountNumber: "12345678" },
        contactName: "Jo",
        nested: [{ password: "x", note: "ring 07700900123" }],
        imei: "356938035643809",
        quoteId: "6f1c…",
        count: 3,
      }),
    ).toEqual({
      email: FILTERED,
      bank: FILTERED,
      contactName: FILTERED,
      nested: [{ password: FILTERED, note: "ring [phone]" }],
      imei: FILTERED,
      quoteId: "6f1c…",
      count: 3,
    });
  });

  it("stops at a sensible depth", () => {
    let deep: Record<string, unknown> = { v: "x" };
    for (let i = 0; i < 20; i++) deep = { child: deep };
    expect(JSON.stringify(scrubValue(deep))).toContain(FILTERED);
  });
});

describe("scrubEvent", () => {
  const event = {
    event_id: "1",
    type: undefined,
    message: "Payout failed for jo@example.com",
    user: { id: "u1", email: "jo@example.com", ip_address: "203.0.113.9" },
    server_name: "host-1",
    request: {
      method: "POST",
      url: "https://x.test/sell/track/AbCdEfGhIjKlMnOpQrStUv",
      query_string: "token=abc&model=iphone-15",
      cookies: { "__Secure-ru.session": "s3cr3t" },
      headers: {
        Cookie: "__Secure-ru.session=s3cr3t",
        Authorization: "Bearer abc",
        "X-Forwarded-For": "203.0.113.9",
        "Stripe-Signature": "t=1,v1=abc",
        "User-Agent": "Mozilla/5.0",
      },
      data: { email: "jo@example.com", phone: "07700900123", model: "iPhone 15" },
    },
    exception: {
      values: [
        {
          type: "Error",
          value: "Duplicate key: jo@example.com",
          stacktrace: { frames: [{ filename: "a.js", vars: { bankDetails: "12-34-56" } }] },
        },
      ],
    },
    extra: { orderEmail: "jo@example.com", attempts: 2 },
    contexts: { os: { name: "macOS" } },
    breadcrumbs: [
      { category: "console", level: "log", message: "debug jo@example.com" },
      { category: "fetch", data: { url: "/orders/AbCdEfGhIjKlMnOpQrStUv", method: "GET" } },
    ],
  } as unknown as ErrorEvent;

  it("removes the user, cookies, identifying headers and local variables", () => {
    const out = scrubEvent(event);
    const json = JSON.stringify(out);
    for (const secret of [
      "jo@example.com",
      "203.0.113.9",
      "s3cr3t",
      "AbCdEfGhIjKlMnOpQrStUv",
      "07700900123",
      "12-34-56",
      "host-1",
      "token=abc",
    ]) {
      expect(json, secret).not.toContain(secret);
    }
    expect(out.user).toBeUndefined();
    expect(out.request?.headers).toEqual({ "User-Agent": "Mozilla/5.0" });
    expect(out.request).not.toHaveProperty("cookies");
    expect(out.request?.data).toEqual({ email: FILTERED, phone: FILTERED, model: "iPhone 15" });
    expect(out.request?.query_string).toBe("token=[Filtered]&model=iphone-15");
    expect(out.exception?.values?.[0]?.stacktrace?.frames?.[0]).toEqual({ filename: "a.js" });
    expect(out.contexts).toEqual({ os: { name: "macOS" } });
    expect(out.breadcrumbs).toHaveLength(1);
  });

  it("doesn't change the original event", () => {
    scrubEvent(event);
    expect(event.user?.email).toBe("jo@example.com");
  });
});

describe("scrubBreadcrumb", () => {
  it("drops console noise but keeps console errors, scrubbed", () => {
    expect(scrubBreadcrumb({ category: "console", level: "info", message: "x" })).toBeNull();
    expect(
      scrubBreadcrumb({ category: "console", level: "error", message: "jo@example.com" })?.message,
    ).toBe("[email]");
  });
});
