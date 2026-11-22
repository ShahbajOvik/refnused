import { describe, expect, it } from "vitest";

import { mainNav, stores } from "@/config/site";

const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}$/;

describe("stores", () => {
  it("have unique slugs", () => {
    const slugs = stores.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it.each(stores)("$name has a valid UK postcode and E.164 phone number", (store) => {
    expect(store.address.postcode).toMatch(UK_POSTCODE);
    expect(store.phone).toMatch(/^\+44\d{10}$/);
  });

  it.each(stores)("$name display phone matches its E.164 number", (store) => {
    const digits = store.phoneDisplay.replace(/\D/g, "");
    expect(`+44${digits.slice(1)}`).toBe(store.phone);
  });
});

describe("mainNav", () => {
  it("contains the four primary sections in order", () => {
    expect(mainNav.map((i) => i.label)).toEqual(["Sell", "Shop", "Stores", "Help"]);
  });
});
