import { describe, expect, it } from "vitest";

import { cacheRuleFor, isNetworkOnlyPath } from "./cache-rules";

const ORIGIN = "https://www.example.co.uk";
const R2 = "https://media.example.co.uk";

function rule(path: string, init: { method?: string; destination?: string; origin?: string } = {}) {
  return cacheRuleFor({
    method: init.method ?? "GET",
    url: new URL(path, init.origin ?? ORIGIN),
    origin: ORIGIN,
    destination: init.destination ?? "document",
    imageOrigins: ["https://cdn.sanity.io", R2],
  });
}

describe("cacheRuleFor", () => {
  it("never caches personal areas, in HTML or RSC requests", () => {
    for (const path of [
      "/basket",
      "/checkout",
      "/checkout?step=pay",
      "/account",
      "/account/orders",
      "/admin",
      "/admin/quotes/123",
      "/orders/abcdefghijklmnopqrstuvwxyz",
      "/sell/track/abcdefghijklmnopqrstuvwxyz",
      "/sign-in",
      "/api/models/search?q=iphone",
      "/api/auth/session",
      "/api/stripe/webhook",
    ]) {
      expect(rule(path), path).toBe("network-only");
      expect(rule(path, { destination: "" }), `${path} (RSC)`).toBe("network-only");
    }
  });

  it("treats every mutating request as network-only, wherever it goes", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "post"]) {
      expect(rule("/shop/apple/iphone-15-128gb-black-k3x9q2", { method })).toBe("network-only");
      expect(rule("/sell/apple/iphone-15", { method, destination: "" })).toBe("network-only");
      expect(rule("/api/push/subscription-change", { method })).toBe("network-only");
    }
  });

  it("uses stale-while-revalidate for product and model pages", () => {
    expect(rule("/shop/apple/iphone-15-128gb-black-k3x9q2")).toBe("page-swr");
    expect(rule("/shop/apple/iphone-15-128gb-black-k3x9q2?_rsc=abc", { destination: "" })).toBe(
      "page-swr",
    );
    expect(rule("/sell/samsung/galaxy-s24")).toBe("page-swr");
    expect(rule("/sell/samsung/galaxy-s24/")).toBe("page-swr");
  });

  it("doesn't mistake other two-part paths for product or model pages", () => {
    expect(rule("/shop/category/tablets")).toBe("page-network-first");
    expect(rule("/sell/track/abcdefghijklmnopqrstuvwxyz")).toBe("network-only");
    expect(rule("/shop/apple")).toBe("page-network-first");
    expect(rule("/sell/apple")).toBe("page-network-first");
    expect(rule("/shop/apple/iphone/extra")).toBe("page-network-first");
  });

  it("uses stale-while-revalidate for images, including R2 and Sanity", () => {
    expect(rule("/_next/image?url=%2Fmedia%2Fa.jpg&w=640&q=75", { destination: "image" })).toBe(
      "image-swr",
    );
    expect(rule("/media/sample/iphone.webp", { destination: "image" })).toBe("image-swr");
    expect(rule("/icons/icon-192.png", { destination: "image" })).toBe("image-swr");
    expect(rule(`${R2}/products/abc.webp`, { destination: "image" })).toBe("image-swr");
    expect(rule("https://cdn.sanity.io/images/p/production/a.png", { destination: "image" })).toBe(
      "image-swr",
    );
  });

  it("leaves other sites alone", () => {
    expect(rule("https://js.stripe.com/v3", { destination: "script" })).toBeNull();
    expect(
      rule("https://challenges.cloudflare.com/turnstile/v0/api.js", { destination: "script" }),
    ).toBeNull();
    expect(rule("https://evil.example/a.png", { destination: "image" })).toBeNull();
  });

  it("caches hashed build assets first", () => {
    expect(rule("/_next/static/chunks/app-abc123.js", { destination: "script" })).toBe("static");
    expect(rule("/_next/static/media/font.woff2", { destination: "font" })).toBe("static");
  });

  it("never caches the worker itself", () => {
    expect(rule("/sw.js", { destination: "serviceworker" })).toBe("network-only");
  });

  it("uses network-first for other public pages", () => {
    expect(rule("/")).toBe("page-network-first");
    expect(rule("/stores/metrotech-north-shields")).toBe("page-network-first");
    expect(rule("/shop?grade=A")).toBe("page-network-first");
    expect(rule("/guides", { destination: "" })).toBe("page-network-first");
  });

  it("matches whole path segments only", () => {
    expect(isNetworkOnlyPath("/accounts-help")).toBe(false);
    expect(isNetworkOnlyPath("/basketball")).toBe(false);
    expect(isNetworkOnlyPath("/account")).toBe(true);
    expect(isNetworkOnlyPath("/account/alerts")).toBe(true);
  });
});
