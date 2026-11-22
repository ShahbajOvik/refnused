import { describe, expect, it } from "vitest";

import { trackingUrl, type OrderView } from "@refnused/database/lib/orders/order-service";

import { orderTimeline } from "./orders";

const base: OrderView = {
  id: "o",
  orderNumber: "RU-123456",
  status: "paid",
  email: "a@example.com",
  contactName: null,
  contactPhone: null,
  fulfilmentMethod: "delivery",
  deliveryLabel: "Free tracked delivery",
  shippingAddress: null,
  collectionStore: null,
  subtotalPence: 100,
  deliveryPence: 0,
  tradeInCreditPence: 0,
  tradeInReference: null,
  totalPence: 100,
  placedAt: new Date("2026-11-01"),
  fulfilledAt: null,
  readyForCollectionAt: null,
  completedAt: null,
  tracking: null,
  expiresAt: null,
  createdAt: new Date("2026-11-01"),
  paymentStatus: "succeeded",
  paymentFailure: null,
  items: [],
  requests: [],
};

const states = (o: OrderView) => orderTimeline(o).map((s) => `${s.key}:${s.state}`);

describe("orderTimeline", () => {
  it("follows a delivery from payment to the door", () => {
    expect(states(base)).toEqual(["placed:done", "dispatched:current", "delivered:upcoming"]);
    const dispatched = {
      ...base,
      status: "dispatched",
      fulfilledAt: new Date("2026-11-02"),
      tracking: { carrier: "Royal Mail", number: "AB1GB", url: null },
    };
    expect(states(dispatched)).toEqual(["placed:done", "dispatched:done", "delivered:current"]);
    expect(orderTimeline(dispatched)[1]!.detail).toBe("Royal Mail tracking AB1GB");
    expect(states({ ...dispatched, status: "completed", completedAt: new Date() })).toEqual([
      "placed:done",
      "dispatched:done",
      "delivered:done",
    ]);
  });

  it("follows click and collect", () => {
    const collect = { ...base, fulfilmentMethod: "click_and_collect" as const };
    expect(states(collect)).toEqual(["placed:done", "ready:current", "collected:upcoming"]);
    expect(states({ ...collect, readyForCollectionAt: new Date() })).toEqual([
      "placed:done",
      "ready:done",
      "collected:current",
    ]);
  });

  it("shows cancelled, refunded and unpaid orders", () => {
    expect(states({ ...base, status: "cancelled", placedAt: null })).toEqual([
      "placed:failed",
      "cancelled:failed",
    ]);
    expect(states({ ...base, status: "refunded" }).at(-1)).toBe("refunded:done");
    expect(states({ ...base, status: "pending_payment", placedAt: null })).toEqual([
      "payment:current",
    ]);
  });
});

describe("trackingUrl", () => {
  it("links known carriers and escapes the number", () => {
    expect(trackingUrl("Royal Mail", "AB123456789GB")).toBe(
      "https://www.royalmail.com/track-your-item#/tracking-results/AB123456789GB",
    );
    expect(trackingUrl("dpd", "15501234 5678")).toBe(
      "https://track.dpd.co.uk/parcels/15501234%205678",
    );
    expect(trackingUrl("Some Courier", "X1")).toBeNull();
  });
});
