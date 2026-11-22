import { describe, expect, it } from "vitest";

import { formatDate, formatPrice, telHref } from "./format";

describe("formatPrice", () => {
  it("formats integer pence as GBP with thousands separators", () => {
    expect(formatPrice(129900)).toBe("£1,299.00");
    expect(formatPrice(5)).toBe("£0.05");
    expect(formatPrice(0)).toBe("£0.00");
  });

  it("drops pence for whole amounts when asked", () => {
    expect(formatPrice(31000, { whole: true })).toBe("£310");
    expect(formatPrice(31050, { whole: true })).toBe("£310.50");
  });

  it("formats negative amounts (refunds)", () => {
    expect(formatPrice(-2500)).toBe("-£25.00");
  });

  it("rejects non-integer input so pounds are never passed by mistake", () => {
    expect(() => formatPrice(12.5)).toThrow(TypeError);
  });
});

describe("formatDate", () => {
  const date = new Date(Date.UTC(2026, 10, 17, 12));

  it("uses UK day-month-year order", () => {
    expect(formatDate(date)).toBe("17 November 2026");
    expect(formatDate(date, "short")).toBe("17/11/2026");
  });

  it("formats in UK time, not UTC", () => {
    // 23:30 UTC on 30 June is 00:30 BST on 1 July.
    expect(formatDate(new Date(Date.UTC(2026, 5, 30, 23, 30)), "short")).toBe("01/07/2026");
  });
});

describe("telHref", () => {
  it("strips spaces and punctuation", () => {
    expect(telHref("+44 191 380 0456")).toBe("tel:+441913800456");
  });
});
