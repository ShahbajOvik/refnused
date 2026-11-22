import { describe, expect, it } from "vitest";

import { stores } from "@/config/site";

import {
  formatOpeningHours,
  londonClock,
  openStatus,
  storeAddress,
  storeAddressLines,
  storeDirectionsUrl,
  storeName,
  ukPhoneDisplay,
} from "./stores";

describe("formatOpeningHours", () => {
  it("groups days with the same hours", () => {
    const nine = { opens: "09:00", closes: "17:30" };
    expect(
      formatOpeningHours({
        mon: nine,
        tue: nine,
        wed: nine,
        thu: nine,
        fri: nine,
        sat: { opens: "10:00", closes: "16:00" },
        sun: null,
      }),
    ).toEqual([
      { days: "Mon–Fri", hours: "9am–5:30pm" },
      { days: "Sat", hours: "10am–4pm" },
      { days: "Sun", hours: "Closed" },
    ]);
  });

  it("returns null when hours aren't set", () => {
    expect(formatOpeningHours(null)).toBeNull();
  });
});

describe("ukPhoneDisplay", () => {
  it("formats UK numbers", () => {
    expect(ukPhoneDisplay("+441913800456")).toBe("0191 380 0456");
    expect(ukPhoneDisplay("+442071234567")).toBe("020 7123 4567");
    expect(ukPhoneDisplay("+447700900123")).toBe("07700 900123");
  });
});

const nine = { opens: "09:00", closes: "17:30" };
const HOURS = {
  mon: nine,
  tue: nine,
  wed: nine,
  thu: nine,
  fri: nine,
  sat: { opens: "10:00", closes: "16:00" },
  sun: null,
};

describe("londonClock", () => {
  it("uses GMT in winter and BST in summer", () => {
    // Wednesday 18 November 2026, 09:00 UTC = 09:00 GMT
    expect(londonClock(new Date("2026-11-18T09:00:00Z"))).toEqual({ day: "wed", minutes: 540 });
    // Wednesday 15 July 2026, 08:00 UTC = 09:00 BST
    expect(londonClock(new Date("2026-07-15T08:00:00Z"))).toEqual({ day: "wed", minutes: 540 });
    // Sunday 23:30 UTC in summer is already Monday 00:30 in London
    expect(londonClock(new Date("2026-07-19T23:30:00Z"))).toEqual({ day: "mon", minutes: 30 });
  });
});

describe("openStatus", () => {
  const at = (iso: string) => openStatus(HOURS, new Date(iso));

  it("is open from opening time up to (not including) closing time", () => {
    expect(at("2026-11-18T09:00:00Z")).toEqual({ open: true, text: "Open now · closes 5:30pm" });
    expect(at("2026-11-18T17:29:00Z")?.open).toBe(true);
    expect(at("2026-11-18T17:30:00Z")?.open).toBe(false);
  });

  it("says closing soon in the last 30 minutes", () => {
    expect(at("2026-11-18T17:00:00Z")).toEqual({
      open: true,
      text: "Closing soon · closes 5:30pm",
    });
  });

  it("gives today's opening time before opening", () => {
    expect(at("2026-11-18T08:15:00Z")).toEqual({ open: false, text: "Closed · opens 9am" });
  });

  it("gives tomorrow's or the next day's opening after closing", () => {
    // Wednesday evening → Thursday
    expect(at("2026-11-18T18:00:00Z")?.text).toBe("Closed · opens tomorrow at 9am");
    // Saturday evening → Sunday closed → Monday
    expect(at("2026-11-21T17:00:00Z")?.text).toBe("Closed · opens Monday at 9am");
    // Friday evening → Saturday's later opening
    expect(at("2026-11-20T18:00:00Z")?.text).toBe("Closed · opens tomorrow at 10am");
  });

  it("works in British Summer Time", () => {
    // 16:45 UTC on a July Wednesday is 17:45 BST: closed
    expect(at("2026-07-15T16:45:00Z")?.open).toBe(false);
    // 08:30 UTC is 09:30 BST: open
    expect(at("2026-07-15T08:30:00Z")?.open).toBe(true);
  });

  it("handles stores closed all week and missing hours", () => {
    const closed = Object.fromEntries(Object.keys(HOURS).map((d) => [d, null])) as never;
    expect(openStatus(closed, new Date())).toEqual({ open: false, text: "Closed" });
    expect(openStatus(null, new Date())).toBeNull();
  });
});

describe("NAP helpers", () => {
  it("write every store's name, address and phone the same way", () => {
    const store = stores.find((s) => s.slug === "fairtech-north-shields")!;
    expect(storeName(store)).toBe("FairTech, North Shields");
    expect(storeAddressLines(store)).toEqual([
      "20B Saville Street (West)",
      "North Shields NE29 6QR",
    ]);
    expect(storeAddress(store)).toBe("20B Saville Street (West), North Shields NE29 6QR");
    expect(ukPhoneDisplay(store.phone)).toBe(store.phoneDisplay);
  });

  it("matches the config's display phone for every store", () => {
    for (const store of stores) expect(ukPhoneDisplay(store.phone)).toBe(store.phoneDisplay);
  });

  it("links directions to the store's full address", () => {
    const url = new URL(storeDirectionsUrl(stores[0]!));
    expect(url.hostname).toBe("www.google.com");
    expect(url.searchParams.get("destination")).toBe(
      "MetroTech, 77A Rudyerd Street, North Shields NE29 6RR",
    );
  });
});
