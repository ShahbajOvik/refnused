import { describe, expect, it } from "vitest";

import { orderPush, priceAlertPush, quotePush, type QuotePushEvent } from "./messages";
import { isKnownPushService, pushSubscriptionSchema, pushTopicInputSchema } from "./subscription";

const KEYS = {
  p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
  auth: "tBHItJI5svbpez7KI4CCXg",
};

describe("isKnownPushService", () => {
  it("accepts the browsers' push services", () => {
    for (const endpoint of [
      "https://fcm.googleapis.com/fcm/send/abc:def",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
      "https://web.push.apple.com/QGuQyavXutnMH",
      "https://wns2-par02p.notify.windows.com/w/?token=BQYAAA",
    ]) {
      expect(isKnownPushService(endpoint), endpoint).toBe(true);
    }
  });

  it("rejects anything we shouldn't POST to", () => {
    for (const endpoint of [
      "http://fcm.googleapis.com/fcm/send/abc", // not https
      "https://fcm.googleapis.com:8443/fcm/send/abc", // odd port
      "https://user:pass@fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com.evil.example/fcm/send/abc",
      "https://evilfcm.googleapis.com/x",
      "https://notify.windows.com/x", // bare suffix
      "https://evil-notify.windows.com.example/x",
      "https://localhost/push",
      "https://169.254.169.254/latest/meta-data",
      "javascript:alert(1)",
      "not a url",
    ]) {
      expect(isKnownPushService(endpoint), endpoint).toBe(false);
    }
  });
});

describe("pushSubscriptionSchema", () => {
  it("accepts PushSubscription.toJSON()", () => {
    const parsed = pushSubscriptionSchema.safeParse({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      expirationTime: null,
      keys: KEYS,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects bad keys and unknown services", () => {
    const base = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: KEYS };
    expect(
      pushSubscriptionSchema.safeParse({ ...base, keys: { ...KEYS, auth: "short" } }).success,
    ).toBe(false);
    expect(
      pushSubscriptionSchema.safeParse({ ...base, keys: { ...KEYS, p256dh: "a b" } }).success,
    ).toBe(false);
    expect(
      pushSubscriptionSchema.safeParse({ ...base, endpoint: "https://example.com/push" }).success,
    ).toBe(false);
    expect(
      pushSubscriptionSchema.safeParse({
        ...base,
        endpoint: `https://fcm.googleapis.com/${"a".repeat(2100)}`,
      }).success,
    ).toBe(false);
  });
});

describe("pushTopicInputSchema", () => {
  it("needs a well-formed token for quotes and orders", () => {
    expect(pushTopicInputSchema.safeParse({ kind: "quote", token: "a".repeat(32) }).success).toBe(
      true,
    );
    expect(pushTopicInputSchema.safeParse({ kind: "order", token: "a".repeat(32) }).success).toBe(
      true,
    );
    expect(pushTopicInputSchema.safeParse({ kind: "quote", token: "short" }).success).toBe(false);
    expect(pushTopicInputSchema.safeParse({ kind: "order", token: "../../admin" }).success).toBe(
      false,
    );
    expect(pushTopicInputSchema.safeParse({ kind: "price_alerts" }).success).toBe(true);
    expect(pushTopicInputSchema.safeParse({ kind: "staff" }).success).toBe(false);
  });
});

describe("push messages", () => {
  const quote = {
    reference: "RU-Q-ABC123",
    device: "Apple iPhone 15, 128GB",
    path: "/sell/track/tok",
  };

  it("covers every quote event without personal details", () => {
    const events: QuotePushEvent[] = [
      "received",
      "revised",
      "approved",
      "rejected",
      "paid",
      "returned",
    ];
    for (const event of events) {
      const payload = quotePush(event, quote);
      expect(payload.url).toBe("/sell/track/tok");
      expect(payload.tag).toBe("quote:RU-Q-ABC123");
      expect(payload.body).toContain("RU-Q-ABC123");
      // No amounts on a lock screen.
      expect(payload.body).not.toMatch(/£/);
    }
    expect(new Set(events.map((e) => quotePush(e, quote).title)).size).toBe(events.length);
  });

  it("names the collection store when an order is ready", () => {
    const payload = orderPush("ready", {
      orderNumber: "RU-1001",
      path: "/orders/tok",
      store: "FairTech, South Shields",
    });
    expect(payload.body).toBe("Order RU-1001 is ready at FairTech, South Shields. Bring photo ID.");
    expect(orderPush("dispatched", { orderNumber: "RU-1001", path: "/orders/tok" }).tag).toBe(
      "order:RU-1001",
    );
  });

  it("formats price alerts in pounds", () => {
    expect(
      priceAlertPush({
        id: "a1",
        type: "shop",
        model: "Apple iPhone 15",
        pricePence: 42900,
        path: "/shop/apple/x",
      }),
    ).toEqual({
      title: "Price alert: price drop",
      body: "A refurbished Apple iPhone 15 is now £429.00 at RefurbednUsed.",
      url: "/shop/apple/x",
      tag: "price-alert:a1",
    });
    expect(
      priceAlertPush({
        id: "a2",
        type: "trade_in",
        model: "Apple iPhone 15",
        pricePence: 30000,
        path: "/sell/apple/iphone-15",
      }).body,
    ).toBe("We now pay up to £300.00 for the Apple iPhone 15. Get your quote.");
  });
});
