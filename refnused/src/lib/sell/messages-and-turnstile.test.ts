import { describe, expect, it, vi } from "vitest";

import { verifyTurnstile } from "@/lib/security/turnstile";

import {
  quoteConfirmationEmail,
  quoteConfirmationSms,
  type QuoteMessageInput,
} from "./quote-messages";

const message: QuoteMessageInput = {
  name: "Jo <b>Bloggs</b>",
  reference: "RU-Q-7K3M9P",
  device: "Apple iPhone 15, 128GB",
  offerPence: 26000,
  priceLockedUntil: new Date("2026-12-01T12:00:00Z"),
  delivery: {
    method: "store_drop_off",
    storeName: "MetroTech",
    storeAddress: "77A Rudyerd Street, North Shields NE29 6RR",
  },
  trackingUrl: "https://example.co.uk/sell/track/abc",
};

describe("quote confirmation messages", () => {
  it("includes the reference, offer, en-GB lock date and next step", () => {
    const email = quoteConfirmationEmail(message);
    expect(email.subject).toBe("Your RefurbednUsed quote RU-Q-7K3M9P: £260.00");
    expect(email.text).toContain("Price locked until: 1 December 2026");
    expect(email.text).toContain("Bring your phone to MetroTech, 77A Rudyerd Street");
    expect(email.text).toContain(message.trackingUrl);
  });

  it("escapes customer-provided text in HTML", () => {
    const { html } = quoteConfirmationEmail(message);
    expect(html).not.toContain("<b>Bloggs</b>");
    expect(html).toContain("Jo &#60;b&#62;Bloggs");
  });

  it("keeps the SMS short", () => {
    const sms = quoteConfirmationSms(message);
    expect(sms).toContain("£260.00");
    expect(sms).toContain("01/12/2026");
    expect(sms.length).toBeLessThanOrEqual(306);
  });
});

describe("verifyTurnstile", () => {
  const ok = (body: object) => vi.fn(async () => new Response(JSON.stringify(body)));

  it("accepts a token Cloudflare confirms", async () => {
    const fetchImpl = ok({ success: true, action: "sell_quote" });
    const result = await verifyTurnstile("token", {
      secret: "s",
      remoteIp: "203.0.113.5",
      action: "sell_quote",
      fetchImpl,
    });
    expect(result.success).toBe(true);
    const body = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1]
      .body as URLSearchParams;
    expect(Object.fromEntries(body)).toEqual({
      secret: "s",
      response: "token",
      remoteip: "203.0.113.5",
    });
  });

  it("rejects missing tokens without calling Cloudflare", async () => {
    const fetchImpl = ok({ success: true });
    expect((await verifyTurnstile("", { secret: "s", fetchImpl })).success).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects tokens Cloudflare refuses", async () => {
    const result = await verifyTurnstile("t", {
      secret: "s",
      fetchImpl: ok({ success: false, "error-codes": ["invalid-input-response"] }),
    });
    expect(result).toEqual({ success: false, errorCodes: ["invalid-input-response"] });
  });

  it("rejects tokens issued for a different action", async () => {
    const result = await verifyTurnstile("t", {
      secret: "s",
      action: "sell_quote",
      fetchImpl: ok({ success: true, action: "login" }),
    });
    expect(result.success).toBe(false);
  });

  it("fails closed when Cloudflare can't be reached", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    expect((await verifyTurnstile("t", { secret: "s", fetchImpl })).success).toBe(false);
  });
});
