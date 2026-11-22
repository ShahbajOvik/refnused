import { describe, expect, it } from "vitest";

import { addToBasket, MAX_BASKET_ITEMS, parseBasket, serializeBasket } from "./basket";
import { orderConfirmationEmail, orderConfirmationSms } from "./messages";
import { requestEligibility, returnDeadline, warrantyDeadline } from "./requests";
import { calculateOrderTotals, MIN_CARD_CHARGE_PENCE, OrderTotalsError } from "./totals";

describe("calculateOrderTotals", () => {
  it("adds items and delivery", () => {
    expect(calculateOrderTotals({ itemPricesPence: [46900, 25900], deliveryPence: 599 })).toEqual({
      subtotalPence: 72800,
      deliveryPence: 599,
      tradeInCreditPence: 0,
      tradeInRemainderPence: 0,
      totalPence: 73399,
    });
  });

  it("takes a trade-in off the total", () => {
    expect(
      calculateOrderTotals({
        itemPricesPence: [46900],
        deliveryPence: 0,
        tradeInValuePence: 26000,
      }),
    ).toMatchObject({ tradeInCreditPence: 26000, tradeInRemainderPence: 0, totalPence: 20900 });
  });

  it("never takes the card payment below Stripe's minimum; the rest is paid separately", () => {
    const totals = calculateOrderTotals({
      itemPricesPence: [15900],
      deliveryPence: 0,
      tradeInValuePence: 26000,
    });
    expect(totals).toEqual({
      subtotalPence: 15900,
      deliveryPence: 0,
      tradeInCreditPence: 15900 - MIN_CARD_CHARGE_PENCE,
      tradeInRemainderPence: 26000 - (15900 - MIN_CARD_CHARGE_PENCE),
      totalPence: MIN_CARD_CHARGE_PENCE,
    });
  });

  it("covers delivery with the trade-in too", () => {
    expect(
      calculateOrderTotals({
        itemPricesPence: [10000],
        deliveryPence: 599,
        tradeInValuePence: 10569,
      }),
    ).toMatchObject({ tradeInCreditPence: 10569, totalPence: 30 });
  });

  it("rejects an empty basket, floats and negatives", () => {
    expect(() => calculateOrderTotals({ itemPricesPence: [], deliveryPence: 0 })).toThrow(
      OrderTotalsError,
    );
    expect(() => calculateOrderTotals({ itemPricesPence: [100.5], deliveryPence: 0 })).toThrow(
      OrderTotalsError,
    );
    expect(() => calculateOrderTotals({ itemPricesPence: [100], deliveryPence: -1 })).toThrow(
      OrderTotalsError,
    );
    expect(() =>
      calculateOrderTotals({ itemPricesPence: [100], deliveryPence: 0, tradeInValuePence: -5 }),
    ).toThrow(OrderTotalsError);
  });
});

describe("basket cookie", () => {
  const a = "11111111-1111-4111-8111-111111111111";
  const b = "22222222-2222-4222-8222-222222222222";

  it("round-trips ids and drops junk and duplicates", () => {
    expect(parseBasket(serializeBasket([a, b]))).toEqual([a, b]);
    expect(parseBasket(`${a}.${a}.not-an-id.${b.toUpperCase()}`)).toEqual([a, b]);
    expect(parseBasket(undefined)).toEqual([]);
  });

  it("caps the basket", () => {
    const ids = Array.from(
      { length: 8 },
      (_, i) => `${String(i).repeat(8)}-1111-4111-8111-111111111111`,
    );
    expect(parseBasket(ids.join("."))).toHaveLength(MAX_BASKET_ITEMS);
    const full = ids.slice(0, MAX_BASKET_ITEMS);
    expect(addToBasket(full, b)).toEqual({ ids: full, full: true });
    expect(addToBasket([a], a)).toEqual({ ids: [a], full: false });
  });
});

describe("returns and warranty windows", () => {
  const paid = new Date("2026-11-01T10:00:00Z");

  it("gives 14 days from dispatch or collection, or from payment if unknown", () => {
    expect(returnDeadline({ placedAt: paid, fulfilledAt: null })).toEqual(
      new Date("2026-11-15T10:00:00Z"),
    );
    expect(
      returnDeadline({ placedAt: paid, fulfilledAt: new Date("2026-11-03T09:00:00Z") }),
    ).toEqual(new Date("2026-11-17T09:00:00Z"));
  });

  it("runs the warranty for the unit's months", () => {
    expect(warrantyDeadline(paid, 12)).toEqual(new Date("2027-11-01T10:00:00Z"));
  });

  it("allows requests inside the window only, and only for paid orders", () => {
    const order = { status: "paid", placedAt: paid, fulfilledAt: null };
    const item = { warrantyMonths: 12 };
    expect(
      requestEligibility("return", order, item, new Date("2026-11-15T10:00:00Z")).allowed,
    ).toBe(true);
    expect(
      requestEligibility("return", order, item, new Date("2026-11-15T10:00:01Z")),
    ).toMatchObject({
      allowed: false,
      reason: "window_closed",
    });
    expect(requestEligibility("warranty", order, item, new Date("2027-06-01")).allowed).toBe(true);
    expect(
      requestEligibility(
        "return",
        { ...order, status: "pending_payment", placedAt: null },
        item,
        paid,
      ),
    ).toEqual({ allowed: false, reason: "not_paid" });
    expect(requestEligibility("return", { ...order, status: "refunded" }, item, paid).allowed).toBe(
      false,
    );
  });
});

describe("order messages", () => {
  const input = {
    name: "Jo <Bloggs>",
    orderNumber: "RU-123456",
    items: [{ description: "Apple iPhone 15, 128GB, Black, Grade A", unitPricePence: 46900 }],
    subtotalPence: 46900,
    deliveryPence: 0,
    tradeInCreditPence: 26000,
    totalPence: 20900,
    fulfilment: {
      method: "click_and_collect" as const,
      storeName: "MetroTech",
      storeAddress: "77A Rudyerd Street, North Shields NE29 6RR",
    },
    orderUrl: "https://example.co.uk/orders/abc",
  };

  it("lists the price breakdown and escapes HTML", () => {
    const email = orderConfirmationEmail(input);
    expect(email.text).toContain("Trade-in credit: −£260.00");
    expect(email.text).toContain("Total paid: £209.00");
    expect(email.html).toContain("Jo &#60;Bloggs&#62;");
    expect(email.html).not.toContain("<Bloggs>");
  });

  it("keeps the SMS short", () => {
    const sms = orderConfirmationSms(input);
    expect(sms).toContain("RU-123456");
    expect(sms.length).toBeLessThan(320);
  });
});
